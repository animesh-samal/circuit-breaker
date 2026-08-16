# Backend

FastAPI service. Walking skeleton: probes and build metadata only.

## Requirements

**Python 3.12.** Pinned in `.python-version` and enforced by `requires-python`.
The container image uses the same version deliberately — a local/container
interpreter mismatch reintroduces exactly the bugs containerisation removes.

## Run locally

```powershell
# Windows PowerShell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python --version                    # must report 3.12.x
python -m pip install --upgrade pip # do this before anything else
pip install -e ".[dev]"

uvicorn app.main:app --reload --port 8000
```

```bash
# macOS / Linux
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ".[dev]"

uvicorn app.main:app --reload --port 8000
```

If `pip install` produces no output for more than ~2 minutes, it is stuck, not
slow. Ctrl+C and re-run with `-v --timeout 20` to find out why.

Then:

```bash
curl localhost:8000/api/health
curl localhost:8000/api/ready
curl localhost:8000/api/version
open http://localhost:8000/api/docs
```

## Checks

```bash
ruff check .
ruff format --check .
mypy app
pytest
```

## Endpoints

| Path | Purpose | Consumer |
|---|---|---|
| `GET /api/health` | Liveness. Does no work by design. | Kubernetes |
| `GET /api/ready` | Readiness. 503 when not serving. | Kubernetes |
| `GET /api/version` | Git SHA, tag, build time. | UI and humans |

See `docs/adr/0003-probe-design.md` for why liveness checks nothing.
