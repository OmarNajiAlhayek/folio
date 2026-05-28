from __future__ import annotations

import grpc
from folio.ai.v1 import similarity_pb2, similarity_pb2_grpc

from app.grpc.errors import abort_mapped
from app.schemas.search import SemanticSearchRequest
from app.schemas.similarity import (
    FindSimilarRequest,
    UpsertArticleRequest,
)
from app.services.similarity_service import SimilarityService


class SimilarityGrpcServicer(similarity_pb2_grpc.SimilarityServiceServicer):
    def __init__(self, similarity_service: SimilarityService) -> None:
        self._similarity = similarity_service

    async def UpsertArticle(
        self,
        request: similarity_pb2.UpsertArticleRequest,
        context: grpc.aio.ServicerContext,
    ) -> similarity_pb2.UpsertArticleResponse:
        try:
            body = UpsertArticleRequest(
                article_id=request.article_id,
                abstract=request.abstract,
                keywords=request.keywords,
                category=request.category,
                full_text=request.full_text,
            )
            await self._similarity.upsert_article(
                body.article_id,
                body.abstract,
                body.keywords,
                body.category,
                full_text=body.full_text,
            )
            return similarity_pb2.UpsertArticleResponse(status="ok")
        except Exception as exc:
            await abort_mapped(context, exc)
            raise

    async def RemoveArticle(
        self,
        request: similarity_pb2.RemoveArticleRequest,
        context: grpc.aio.ServicerContext,
    ) -> similarity_pb2.RemoveArticleResponse:
        try:
            article_id = (request.article_id or "").strip()
            if not article_id:
                raise ValueError("article_id must not be empty")
            await self._similarity.remove_article(article_id)
            return similarity_pb2.RemoveArticleResponse(status="ok")
        except Exception as exc:
            await abort_mapped(context, exc)
            raise

    async def FindSimilarArticles(
        self,
        request: similarity_pb2.FindSimilarArticlesRequest,
        context: grpc.aio.ServicerContext,
    ) -> similarity_pb2.FindSimilarArticlesResponse:
        try:
            body = FindSimilarRequest(
                article_id=request.article_id,
                limit=request.limit if request.HasField("limit") else None,
                similarity_threshold=(
                    request.similarity_threshold
                    if request.HasField("similarity_threshold")
                    else None
                ),
                same_category_only=(
                    request.same_category_only
                    if request.HasField("same_category_only")
                    else None
                ),
            )
            items = await self._similarity.find_similar(
                body.article_id,
                limit=body.limit,
                similarity_threshold=body.similarity_threshold,
                same_category_only=body.same_category_only,
            )
            return similarity_pb2.FindSimilarArticlesResponse(
                hits=[
                    similarity_pb2.SimilarArticleHit(
                        article_id=item["article_id"],
                        abstract=item["abstract"],
                        keywords=item["keywords"],
                        category=item["category"],
                        similarity=item["similarity"],
                    )
                    for item in items
                ],
            )
        except Exception as exc:
            await abort_mapped(context, exc)
            raise

    async def SemanticSearch(
        self,
        request: similarity_pb2.SemanticSearchRequest,
        context: grpc.aio.ServicerContext,
    ) -> similarity_pb2.SemanticSearchResponse:
        try:
            body = SemanticSearchRequest(
                query=request.query,
                limit=request.limit if request.HasField("limit") else None,
            )
            items = await self._similarity.semantic_search(
                body.query,
                limit=body.limit,
            )
            return similarity_pb2.SemanticSearchResponse(
                hits=[
                    similarity_pb2.SemanticSearchHit(
                        article_id=item["article_id"],
                        snippet=item["snippet"],
                        score=item["score"],
                    )
                    for item in items
                ],
            )
        except Exception as exc:
            await abort_mapped(context, exc)
            raise

    async def GetSimilarityStatus(
        self,
        _request: similarity_pb2.GetSimilarityStatusRequest,
        context: grpc.aio.ServicerContext,
    ) -> similarity_pb2.SimilarityStatus:
        try:
            status = self._similarity.status()
            return similarity_pb2.SimilarityStatus(
                enabled=bool(status["enabled"]),
                chroma_path=str(status["chroma_path"]),
                model_name=str(status["model_name"]),
                default_threshold=float(status["default_threshold"]),
                same_category_only=bool(status["same_category_only"]),
            )
        except Exception as exc:
            await abort_mapped(context, exc)
            raise
