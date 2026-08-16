"""Process-local runtime state.

Deliberately tiny. This exists so readiness can answer "has startup finished?"
without reaching outside the process. Anything shared across replicas belongs in
DynamoDB, not here -- each pod has its own copy of this.
"""

from dataclasses import dataclass, field


@dataclass
class RuntimeState:
    startup_complete: bool = False
    shutting_down: bool = False
    checks: dict[str, str] = field(default_factory=dict)


state = RuntimeState()
