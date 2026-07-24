import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI

from app.api import health, v1
from app.config import RuntimeConfigError, get_settings
from app.observability import configure_logging, get_logger, init_telemetry, shutdown_telemetry
from app.observability.telemetry import instrument_fastapi
from app.grpc.server import fail_startup, start_grpc_server, stop_grpc_server
from app.providers import create_provider
from app.services.classifier_service import ClassifierService
from app.services.classifier_warmup import warmup_classifier_if_configured
from app.services.copyedit_analysis_service import CopyeditAnalysisService
from app.services.keyword_suggestion_service import KeywordSuggestionService
from app.services.reviewer_matching_grpc_service import ReviewerMatchingGrpcService
from app.services.similarity_service import SimilarityService

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    init_telemetry(settings.otel_service_name, settings.app_env)
    configure_logging(
        service_name=settings.otel_service_name,
        log_level=settings.log_level,
        log_format=settings.log_format,
    )
    logger = get_logger(__name__)
    app.state.settings = settings
    app.state.ai_provider = create_provider(settings)
    app.state.classifier_service = ClassifierService(settings)
    app.state.similarity_service = SimilarityService(settings)
    app.state.reviewer_matching_service = ReviewerMatchingGrpcService(settings)
    app.state.keyword_suggestion_service = KeywordSuggestionService(settings)
    app.state.copyedit_analysis_service = CopyeditAnalysisService(settings)
    logger.info(
        "ai-service ready",
        provider=app.state.ai_provider.name,
        arabert=settings.arabert_enabled,
        similarity=settings.similarity_enabled,
        reviewer_matching=settings.reviewer_matching_enabled,
        keywords=settings.keywords_suggestion_enabled,
        copyedit=settings.copyedit_analysis_enabled,
        env=settings.app_env,
    )
    grpc_server = None
    try:
        grpc_server, _bound_port = await start_grpc_server(
            app.state.classifier_service,
            app.state.keyword_suggestion_service,
            app.state.similarity_service,
            app.state.reviewer_matching_service,
            app.state.copyedit_analysis_service,
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
        from app.ml.vector.ai_engine import AIEngine

        AIEngine.shutdown()
        shutdown_telemetry()


def create_app() -> FastAPI:
    try:
        get_settings()
    except RuntimeConfigError as err:
        print(f"Configuration invalid: {err}", file=sys.stderr)
        raise SystemExit(1) from err

    app = FastAPI(
        title="Damascus University Journal AI Service",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.include_router(health.router)
    app.include_router(v1.router)
    instrument_fastapi(app)
    return app


app = create_app()


def main() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.http_bind_host,
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
