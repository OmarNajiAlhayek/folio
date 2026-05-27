from fastapi import APIRouter, Depends, HTTPException, Request

from app.dependencies.service_token import require_service_token
from app.schemas.classify import (
    ClassifierLabelsResponse,
    ClassifierStatusResponse,
    ClassifyAbstractRequest,
    ClassifyArticleRequest,
    ClassifyResponse,
)
from app.services.classifier_service import (
    ClassifierDisabledError,
    ClassifierUnavailableError,
)

router = APIRouter(
    prefix="/classify",
    tags=["classify"],
    dependencies=[Depends(require_service_token)],
)


def _classifier_or_503(request: Request):
    service = request.app.state.classifier_service
    try:
        return service
    except AttributeError as err:
        raise HTTPException(status_code=503, detail="Classifier service not initialized") from err


def _handle_classifier_errors(exc: Exception) -> HTTPException:
    if isinstance(exc, ClassifierDisabledError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, ClassifierUnavailableError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    raise exc


@router.get("/status", response_model=ClassifierStatusResponse)
async def classify_status(request: Request) -> ClassifierStatusResponse:
    service = _classifier_or_503(request)
    return ClassifierStatusResponse(**service.status())


@router.get("/labels", response_model=ClassifierLabelsResponse)
async def classify_labels(request: Request) -> ClassifierLabelsResponse:
    service = _classifier_or_503(request)
    try:
        return ClassifierLabelsResponse(labels=service.labels())
    except Exception as exc:
        raise _handle_classifier_errors(exc) from exc


@router.post("/abstract", response_model=ClassifyResponse)
async def classify_abstract(
    request: Request,
    body: ClassifyAbstractRequest,
) -> ClassifyResponse:
    service = _classifier_or_503(request)
    try:
        result = await service.classify_abstract(body.abstract)
        return ClassifyResponse(**result)
    except Exception as exc:
        raise _handle_classifier_errors(exc) from exc


@router.post("/article", response_model=ClassifyResponse)
async def classify_article(
    request: Request,
    body: ClassifyArticleRequest,
) -> ClassifyResponse:
    service = _classifier_or_503(request)
    try:
        result = await service.classify_article(body.title, body.keywords, body.abstract)
        return ClassifyResponse(**result)
    except Exception as exc:
        raise _handle_classifier_errors(exc) from exc
