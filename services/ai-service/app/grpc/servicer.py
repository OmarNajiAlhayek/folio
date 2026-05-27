from __future__ import annotations

import grpc
from folio.ai.v1 import classifier_pb2, classifier_pb2_grpc

from app.grpc.errors import abort_mapped
from app.services.classifier_service import ClassifierService


def _require_non_empty_abstract(abstract: str) -> None:
    if not abstract.strip():
        raise ValueError("abstract must not be empty")


def _to_classify_response(result: dict[str, object]) -> classifier_pb2.ClassifyResponse:
    probabilities = result.get("probabilities", {})
    if not isinstance(probabilities, dict):
        probabilities = {}
    return classifier_pb2.ClassifyResponse(
        top_label=str(result["top_label"]),
        top_confidence=float(result["top_confidence"]),
        probabilities={str(k): float(v) for k, v in probabilities.items()},
    )


class ClassifierGrpcServicer(classifier_pb2_grpc.ClassifierServiceServicer):
    def __init__(self, classifier_service: ClassifierService) -> None:
        self._classifier = classifier_service

    async def ClassifyArticle(
        self,
        request: classifier_pb2.ClassifyArticleRequest,
        context: grpc.aio.ServicerContext,
    ) -> classifier_pb2.ClassifyResponse:
        try:
            _require_non_empty_abstract(request.abstract)
            result = await self._classifier.classify_article(
                request.title,
                request.keywords,
                request.abstract,
            )
            return _to_classify_response(result)
        except Exception as exc:
            await abort_mapped(context, exc)

    async def ClassifyAbstract(
        self,
        request: classifier_pb2.ClassifyAbstractRequest,
        context: grpc.aio.ServicerContext,
    ) -> classifier_pb2.ClassifyResponse:
        try:
            _require_non_empty_abstract(request.abstract)
            result = await self._classifier.classify_abstract(request.abstract)
            return _to_classify_response(result)
        except Exception as exc:
            await abort_mapped(context, exc)

    async def GetClassifierStatus(
        self,
        _request: classifier_pb2.GetClassifierStatusRequest,
        context: grpc.aio.ServicerContext,
    ) -> classifier_pb2.ClassifierStatus:
        try:
            status = self._classifier.status()
            return classifier_pb2.ClassifierStatus(
                enabled=bool(status["enabled"]),
                model_path=status.get("model_path") or None,
                device=status.get("device") or None,
                labels_count=int(status.get("labels_count", 0)),
                weights_loaded=bool(status.get("weights_loaded", False)),
                model_configured=bool(status.get("model_configured", False)),
            )
        except Exception as exc:
            await abort_mapped(context, exc)

    async def GetClassifierLabels(
        self,
        _request: classifier_pb2.GetClassifierLabelsRequest,
        context: grpc.aio.ServicerContext,
    ) -> classifier_pb2.ClassifierLabels:
        try:
            labels = self._classifier.labels()
            return classifier_pb2.ClassifierLabels(labels=list(labels))
        except Exception as exc:
            await abort_mapped(context, exc)
