from fastapi import Header, HTTPException, Request


def require_service_token(
    request: Request,
    x_folio_service_token: str | None = Header(default=None, alias="X-Folio-Service-Token"),
) -> None:
    """When AI_SERVICE_TOKEN is set, classify HTTP routes require the same token as gRPC."""
    settings = request.app.state.settings
    expected = settings.ai_service_token.strip()
    if not expected:
        return
    if (x_folio_service_token or "").strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Folio-Service-Token")
