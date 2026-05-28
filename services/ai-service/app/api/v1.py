from fastapi import APIRouter, Request

router = APIRouter(prefix="/v1", tags=["v1"])


@router.get("/status")
async def status(request: Request) -> dict[str, object]:
    classifier = request.app.state.classifier_service
    similarity = request.app.state.similarity_service
    keywords_svc = request.app.state.keyword_suggestion_service
    return {
        "service": "folio-ai-service",
        "arabert_enabled": classifier.enabled,
        "similarity_enabled": similarity.enabled,
        "keywords_suggestion_enabled": keywords_svc.enabled,
    }
