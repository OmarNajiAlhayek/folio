import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI

from app.api import health, v1
from app.config import RuntimeConfigError, get_settings
from app.grpc.server import fail_startup, start_grpc_server, stop_grpc_server
from app.providers import create_provider
from app.services.classifier_service import ClassifierService
from app.services.classifier_warmup import warmup_classifier_if_configured
from app.services.similarity_service import SimilarityService

load_dotenv()


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    _configure_logging(settings.log_level)
    app.state.settings = settings
    app.state.ai_provider = create_provider(settings)
    app.state.classifier_service = ClassifierService(settings)
    app.state.similarity_service = SimilarityService(settings)
    logging.getLogger(__name__).info(
        "ai-service ready (provider=%s, arabert=%s, similarity=%s, env=%s)",
        app.state.ai_provider.name,
        settings.arabert_enabled,
        settings.similarity_enabled,
        settings.app_env,
    )
    grpc_server = None
    try:
        grpc_server, _bound_port = await start_grpc_server(
            app.state.classifier_service,
            settings,
        )
        app.state.grpc_server = grpc_server
    except RuntimeError as err:
        fail_startup(f"gRPC startup failed: {err}")
    except Exception as err:
        fail_startup(f"gRPC startup failed: {err}")
    await warmup_classifier_if_configured(app.state.classifier_service)
    try:
        yield
    finally:
        await stop_grpc_server(grpc_server)


def create_app() -> FastAPI:
    try:
        get_settings()
    except RuntimeConfigError as err:
        print(f"Configuration invalid: {err}", file=sys.stderr)
        raise SystemExit(1) from err

    app = FastAPI(
        title="Folio AI Service",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.include_router(health.router)
    app.include_router(v1.router)
    return app


app = create_app()


def main() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
