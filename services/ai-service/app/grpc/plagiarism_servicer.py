from __future__ import annotations

import grpc
from folio.ai.v1 import plagiarism_pb2, plagiarism_pb2_grpc

from app.grpc.errors import abort_mapped
from app.services.similarity_service import SimilarityService


class PlagiarismGrpcServicer(plagiarism_pb2_grpc.PlagiarismServiceServicer):
    def __init__(self, similarity_service: SimilarityService) -> None:
        self._similarity = similarity_service

    async def DetectCorpusSimilarity(
        self,
        request: plagiarism_pb2.DetectCorpusSimilarityRequest,
        context: grpc.aio.ServicerContext,
    ) -> plagiarism_pb2.DetectCorpusSimilarityResponse:
        try:
            if not (request.submission_text or "").strip():
                raise ValueError("submission_text must not be empty")
            threshold = request.threshold if request.HasField("threshold") else None
            category = request.category if request.HasField("category") else None
            raw = await self._similarity.detect_corpus_similarity(
                request.submission_text,
                threshold=threshold,
                category=category,
            )
            return plagiarism_pb2.DetectCorpusSimilarityResponse(
                matches=[
                    plagiarism_pb2.CorpusSimilarityMatch(
                        submission_chunk_index=m["submission_chunk_index"],
                        submission_snippet=m["submission_snippet"],
                        source_article_id=m["source_article_id"],
                        source_chunk_index=m["source_chunk_index"],
                        matched_snippet=m["matched_snippet"],
                        similarity=m["similarity"],
                    )
                    for m in raw
                ],
            )
        except Exception as exc:
            await abort_mapped(context, exc)
            raise

    async def GetPlagiarismStatus(
        self,
        _request: plagiarism_pb2.GetPlagiarismStatusRequest,
        context: grpc.aio.ServicerContext,
    ) -> plagiarism_pb2.PlagiarismStatus:
        try:
            status = self._similarity.status()
            return plagiarism_pb2.PlagiarismStatus(enabled=bool(status["enabled"]))
        except Exception as exc:
            await abort_mapped(context, exc)
            raise
