from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])


def _health_payload(ok: bool, checks: dict[str, bool]) -> dict[str, Any]:
    return {
        "status": "ok" if ok else "degraded",
        "checks": checks,
    }


@router.get("/health")
async def health() -> dict[str, Any]:
    """Liveness: process is up."""
    return _health_payload(True, {})


@router.get("/ready")
async def ready(request: Request) -> JSONResponse:
    """Readiness: provider is configured; optional AraBERT weights path when enabled."""
    from app.ml.paths import arabert_model_config_exists

    provider = request.app.state.ai_provider
    provider_ok = await provider.ping()
    checks: dict[str, bool] = {"provider": provider_ok}

    settings = request.app.state.settings
    if settings.arabert_enabled:
        checks["arabert"] = arabert_model_config_exists(settings)

    ok = all(checks.values())
    return JSONResponse(
        content=_health_payload(ok, checks),
        status_code=200 if ok else 503,
    )
