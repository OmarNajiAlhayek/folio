from __future__ import annotations

import grpc
from folio.ai.v1 import keywords_pb2, keywords_pb2_grpc

from app.grpc.errors import abort_mapped
from app.services.keyword_suggestion_service import KeywordSuggestionService


class KeywordGrpcServicer(keywords_pb2_grpc.KeywordServiceServicer):
    def __init__(self, keyword_service: KeywordSuggestionService) -> None:
        self._keywords = keyword_service

    async def SuggestKeywords(
        self,
        request: keywords_pb2.SuggestKeywordsRequest,
        context: grpc.aio.ServicerContext,
    ) -> keywords_pb2.SuggestKeywordsResponse:
        try:
            result = await self._keywords.suggest(
                title=request.title or None,
                abstract=request.abstract or None,
                title_ar=request.title_ar or None,
                abstract_ar=request.abstract_ar or None,
            )
            return keywords_pb2.SuggestKeywordsResponse(
                keywords_en=result["keywords_en"],
                keywords_ar=result["keywords_ar"],
            )
        except Exception as exc:
            await abort_mapped(context, exc)

    async def GetKeywordStatus(
        self,
        _request: keywords_pb2.GetKeywordStatusRequest,
        context: grpc.aio.ServicerContext,
    ) -> keywords_pb2.KeywordStatus:
        try:
            status = self._keywords.status()
            return keywords_pb2.KeywordStatus(enabled=bool(status["enabled"]))
        except Exception as exc:
            await abort_mapped(context, exc)
