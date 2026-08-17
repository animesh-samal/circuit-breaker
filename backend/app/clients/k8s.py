"""Kubernetes API client.

Runs with the pod's own ServiceAccount token, mounted by Kubernetes at
/var/run/secrets/kubernetes.io/serviceaccount. The Role bound to that account is
deliberately narrow -- get/list/watch on pods and deployments, delete on pods,
in one namespace. Nothing cluster-wide, nothing else.

That scoping is the security control for the chaos endpoint. If someone finds
and abuses it, the worst available outcome is deleting a pod that Kubernetes
immediately recreates. The token cannot read Secrets, cannot touch other
namespaces, and cannot modify a Deployment.

Note on threading: the official kubernetes client is synchronous. Calling it
directly from an async handler would block the event loop -- which would stall
every other request on the worker, including /api/health, and get the container
restarted by its own liveness probe. Every call therefore goes through
asyncio.to_thread.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class ContainerInfo:
    name: str
    image: str
    ready: bool
    restart_count: int
    state: str


@dataclass
class PodInfo:
    name: str
    phase: str
    ready: bool
    node: str | None
    pod_ip: str | None
    started_at: str | None
    age_seconds: float
    restart_count: int
    containers: list[ContainerInfo] = field(default_factory=list)


@dataclass
class DeploymentInfo:
    name: str
    desired: int
    ready: int
    available: int
    updated: int
    image: str | None


@dataclass
class ClusterSnapshot:
    namespace: str
    pods: list[PodInfo]
    deployments: list[DeploymentInfo]
    observed_at: str


class KubernetesUnavailableError(RuntimeError):
    """Raised when no usable cluster configuration can be found."""


class K8sClient:
    def __init__(self) -> None:
        self._core: Any = None
        self._apps: Any = None
        self._configured = False

    def _configure(self) -> None:
        """Lazy, and deliberately not called at import time.

        Importing this module must not require a cluster -- unit tests and local
        runs would break, and a failure here at import would crash the process
        before the probes could report anything useful.
        """
        if self._configured:
            return

        from kubernetes import client, config  # imported late to keep startup cheap

        try:
            config.load_incluster_config()
            logger.info("kubernetes: in-cluster config loaded")
        except Exception:
            try:
                config.load_kube_config()
                logger.info("kubernetes: local kubeconfig loaded")
            except Exception as exc:
                raise KubernetesUnavailableError(f"no usable kubernetes config: {exc}") from exc

        self._core = client.CoreV1Api()
        self._apps = client.AppsV1Api()
        self._configured = True

    # -- reads -------------------------------------------------------------

    async def snapshot(self) -> ClusterSnapshot:
        settings = get_settings()
        ns = settings.k8s_namespace
        return await asyncio.to_thread(self._snapshot_sync, ns)

    def _snapshot_sync(self, namespace: str) -> ClusterSnapshot:
        self._configure()
        now = datetime.now(UTC)

        pods: list[PodInfo] = []
        for p in self._core.list_namespaced_pod(namespace).items:
            statuses = p.status.container_statuses or []
            started = p.status.start_time
            containers = [
                ContainerInfo(
                    name=cs.name,
                    image=cs.image,
                    ready=bool(cs.ready),
                    restart_count=int(cs.restart_count or 0),
                    state=_container_state(cs),
                )
                for cs in statuses
            ]
            pods.append(
                PodInfo(
                    name=p.metadata.name,
                    phase=p.status.phase or "Unknown",
                    # "Ready" is a condition, not the phase. A pod can be
                    # Running and not Ready -- that is precisely the state a
                    # failing readiness probe produces.
                    ready=_pod_ready(p),
                    node=p.spec.node_name,
                    pod_ip=p.status.pod_ip,
                    started_at=started.isoformat() if started else None,
                    age_seconds=(now - started).total_seconds() if started else 0.0,
                    restart_count=sum(c.restart_count for c in containers),
                    containers=containers,
                )
            )

        deployments = [
            DeploymentInfo(
                name=d.metadata.name,
                desired=int(d.spec.replicas or 0),
                ready=int(d.status.ready_replicas or 0),
                available=int(d.status.available_replicas or 0),
                updated=int(d.status.updated_replicas or 0),
                image=(
                    d.spec.template.spec.containers[0].image
                    if d.spec.template.spec.containers
                    else None
                ),
            )
            for d in self._apps.list_namespaced_deployment(namespace).items
        ]

        return ClusterSnapshot(
            namespace=namespace,
            pods=sorted(pods, key=lambda x: x.name),
            deployments=sorted(deployments, key=lambda x: x.name),
            observed_at=now.isoformat(),
        )

    # -- the destructive one ----------------------------------------------

    async def delete_pod(self, name: str) -> None:
        settings = get_settings()
        await asyncio.to_thread(self._delete_pod_sync, name, settings.k8s_namespace)

    def _delete_pod_sync(self, name: str, namespace: str) -> None:
        self._configure()
        logger.warning("chaos: deleting pod %s/%s", namespace, name)
        self._core.delete_namespaced_pod(name=name, namespace=namespace)


def _pod_ready(pod: Any) -> bool:
    for cond in pod.status.conditions or []:
        if cond.type == "Ready":
            # Explicit bool(): the SDK object is untyped, so the comparison
            # returns Any and would silently widen this function's return type.
            return bool(cond.status == "True")
    return False


def _container_state(cs: Any) -> str:
    st = cs.state
    if st.running:
        return "running"
    if st.waiting:
        return st.waiting.reason or "waiting"
    if st.terminated:
        return st.terminated.reason or "terminated"
    return "unknown"


k8s = K8sClient()
