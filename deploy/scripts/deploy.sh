#!/usr/bin/env bash
# Runs on the node, invoked by CI over SSM.
#
# Takes the image tag and registry, renders the manifests into a temporary
# directory, applies them, and waits for both rollouts. If either fails to
# converge it rolls back and exits non-zero, so the pipeline reports a failed
# deploy rather than a green tick over a broken cluster.
set -euo pipefail

TAG="${1:?image tag required}"
REGISTRY="${2:?registry host required}"

NS=circuit-breaker
KUBECTL="k3s kubectl"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TIMEOUT=180s

echo "deploying ${TAG} from ${REPO_DIR}"

# Render into a temp dir rather than editing the checkout. Mutating tracked
# files in place leaves the repo dirty, so the next `git checkout` fails and the
# second deploy behaves differently from the first.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp "$REPO_DIR"/deploy/k8s/*.yaml "$WORK/"

sed -i "s|REPLACED_BY_CI|${REGISTRY}/circuit-breaker/api:${TAG}|" "$WORK/10-api.yaml"
sed -i "s|REPLACED_BY_CI|${REGISTRY}/circuit-breaker/web:${TAG}|" "$WORK/20-web.yaml"

if grep -q REPLACED_BY_CI "$WORK"/*.yaml; then
  echo "substitution failed: placeholder still present" >&2
  exit 1
fi

$KUBECTL apply -f "$WORK/00-namespace.yaml" -f "$WORK/01-rbac.yaml" -f "$WORK/02-config.yaml"
$KUBECTL apply -f "$WORK/10-api.yaml" -f "$WORK/20-web.yaml" -f "$WORK/30-ingress.yaml"

# Issuers are cluster-scoped and change rarely, but applying them is idempotent
# and keeps the cluster's certificate configuration in version control rather
# than in whatever state someone left it in. Skipped if cert-manager's CRDs are
# absent, so the deploy still works on a cluster without it installed.
if $KUBECTL get crd clusterissuers.cert-manager.io >/dev/null 2>&1; then
  $KUBECTL apply -f "$WORK/40-issuers.yaml"
else
  echo "cert-manager not installed; skipping issuers"
fi

rollout() {
  local deploy="$1"
  if ! $KUBECTL -n "$NS" rollout status "deploy/$deploy" --timeout="$TIMEOUT"; then
    echo "rollout of $deploy did not converge; rolling back" >&2
    $KUBECTL -n "$NS" rollout undo "deploy/$deploy" || true
    $KUBECTL -n "$NS" rollout status "deploy/$deploy" --timeout="$TIMEOUT" || true
    echo "--- recent events ---" >&2
    $KUBECTL -n "$NS" get events --sort-by=.lastTimestamp | tail -20 >&2
    return 1
  fi
}

rollout circuit-breaker-api
rollout circuit-breaker-web

echo "deployed ${TAG}"
$KUBECTL -n "$NS" get pods -o wide
