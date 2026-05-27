from fastapi import APIRouter, Request

from app.api import classify, similar

router = APIRouter(prefix="/v1", tags=["v1"])
router.include_router(classify.router)
router.include_router(similar.router)


@router.get("/status")
async def status(request: Request) -> dict[str, object]:
    classifier = request.app.state.classifier_service
    similarity = request.app.state.similarity_service
    return {
        "service": "folio-ai-service",
        "arabert_enabled": classifier.enabled,
        "similarity_enabled": similarity.enabled,
    }
