"""Application configuration.

Settings come from environment variables. Build metadata (git SHA, tag, build
time) is injected at image build time via Docker build args, not read from git
at runtime -- the git history is deliberately not present in the final image.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "circuit-breaker"
    environment: str = "local"
    log_level: str = "INFO"

    # Injected at build time. "unknown" means the image was built outside CI.
    git_sha: str = "unknown"
    git_tag: str = "unknown"
    build_time: str = "unknown"

    # AWS
    aws_region: str = "ap-south-1"
    deploys_table: str = "circuit-breaker-deploys"
    cost_cache_table: str = "circuit-breaker-cache"

    # Kubernetes
    k8s_namespace: str = "circuit-breaker"
    chaos_enabled: bool = True
    chaos_min_replicas: int = 2  # refuse to kill the last healthy pod

    # Cache TTLs, in seconds. The cost TTL is a spend control, not a
    # performance tuning knob: Cost Explorer bills $0.01 per request.
    cluster_ttl: float = 10.0
    metrics_ttl: float = 60.0
    deploys_ttl: float = 300.0
    cost_ttl: float = 86_400.0

    # Request metrics are buffered and flushed on this interval rather than
    # published per request. See core/telemetry.py for why.
    metrics_flush_seconds: float = 60.0

    # Local development without a cluster or AWS account. Must stay false in
    # any deployed environment -- guarded explicitly so mock data can never be
    # mistaken for real telemetry.
    mock_infra: bool = False


@lru_cache
def get_settings() -> Settings:
    """Cached so the environment is parsed once per process, not per request."""
    return Settings()
