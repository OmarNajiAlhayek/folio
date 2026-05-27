from fastapi import APIRouter, Depends, HTTPException, Request

from app.dependencies.service_token import require_service_token
from app.schemas.similarity import (
    FindSimilarRequest,
    FindSimilarResponse,
    SimilarArticleResponse,
    SimilarityStatusResponse,
    UpsertArticleRequest,
)
from app.services.similarity_service import (
    SimilarityDisabledError,
    SimilarityUnavailableError,
)

router = APIRouter(
    prefix="/similar",
    tags=["similar"],
    dependencies=[Depends(require_service_token)],
)


def _similarity_or_503(request: Request):
    service = request.app.state.similarity_service
    try:
        return service
    except AttributeError as err:
        raise HTTPException(
            status_code=503,
            detail="Similarity service not initialized",
        ) from err


def _handle_errors(exc: Exception) -> HTTPException:
    if isinstance(exc, (SimilarityDisabledError, SimilarityUnavailableError)):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    raise exc


@router.get("/status", response_model=SimilarityStatusResponse)
async def similarity_status(request: Request) -> SimilarityStatusResponse:
    service = _similarity_or_503(request)
    return SimilarityStatusResponse(**service.status())


@router.post("/articles")
async def upsert_article(request: Request, body: UpsertArticleRequest) -> dict[str, str]:
    service = _similarity_or_503(request)
    try:
        await service.upsert_article(
            body.article_id,
            body.abstract,
            body.keywords,
            body.category,
        )
        return {"status": "ok"}
    except Exception as exc:
        raise _handle_errors(exc) from exc


@router.delete("/articles/{article_id}")
async def delete_article(request: Request, article_id: str) -> dict[str, str]:
    service = _similarity_or_503(request)
    try:
        await service.remove_article(article_id)
        return {"status": "ok"}
    except Exception as exc:
        raise _handle_errors(exc) from exc


@router.post("/find", response_model=FindSimilarResponse)
async def find_similar(
    request: Request,
    body: FindSimilarRequest,
) -> FindSimilarResponse:
    service = _similarity_or_503(request)
    try:
        items = await service.find_similar(
            body.article_id,
            limit=body.limit,
            similarity_threshold=body.similarity_threshold,
            same_category_only=body.same_category_only,
        )
        return FindSimilarResponse(
            items=[SimilarArticleResponse(**item) for item in items],
        )
    except Exception as exc:
        raise _handle_errors(exc) from exc
