# Kubernetes manifests

Applied in filename order. Numbered so `kubectl apply -f .` gets the dependency
order right without needing a tool.

| File | What |
|---|---|
| `00-namespace.yaml` | namespace |
| `01-rbac.yaml` | ServiceAccounts, Role, RoleBinding |
| `02-config.yaml` | ConfigMap |
| `10-api.yaml` | API Deployment, Service, PDB, HPA |
| `20-web.yaml` | web Deployment, Service |
| `30-ingress.yaml` | path-based routing |

`image: REPLACED_BY_CI` is substituted at deploy time with the immutable tag
being released. Nothing here pins a floating tag like `latest`, because a
rollback to a floating tag is not a rollback.

## First deploy, by hand

Once images exist in ECR:

```bash
# on the node
sudo k3s kubectl apply -f 00-namespace.yaml -f 01-rbac.yaml -f 02-config.yaml
sudo k3s kubectl -n circuit-breaker apply -f 10-api.yaml -f 20-web.yaml -f 30-ingress.yaml
sudo k3s kubectl -n circuit-breaker rollout status deploy/circuit-breaker-api
```

## Debugging

```bash
kubectl -n circuit-breaker get pods -o wide
kubectl -n circuit-breaker describe pod <name>        # events explain Pending and ImagePull
kubectl -n circuit-breaker logs <name> --previous     # the crash before the restart
kubectl -n circuit-breaker get events --sort-by=.lastTimestamp
```

`describe` before `logs`. A pod that never started has no logs, and its events
tell you why — insufficient memory, image pull failure, no matching node.

## Deliberate choices

**Role, not ClusterRole.** The API can read pods and delete them in one
namespace. Nothing cluster-wide, no access to Secrets. This is what makes a
public chaos endpoint defensible.

**No Secret objects at all.** AWS access comes from the node's instance profile,
Kubernetes access from the ServiceAccount token. Both are issued at runtime and
short-lived. A Secret would be a credential that can leak.

**`readOnlyRootFilesystem: true`** on both containers, with `emptyDir` volumes
for the paths that genuinely need writing.

**Startup probe before liveness.** A slow start and a hang look identical to a
liveness probe. Without a startup probe, a cold start that takes 40s gets
restarted forever.

**`preStop` sleep.** Endpoint removal is eventually consistent — kube-proxy has
to update rules on every node while traffic is still arriving. Sleeping before
shutdown is what actually produces zero-downtime deploys; the readiness flag
alone is not enough.

**`maxSurge: 1`, not 2.** On a 1 GiB node, surging two extra API pods leaves the
new ones Pending on memory and the rollout stalls.
