from __future__ import annotations

import grpc
from folio.ai.v1 import plagiarism_pb2, plagiarism_pb2_grpc

from app.grpc.errors import abort_mapped
from app.services.similarity_service import SimilarityService


def _exact_report_message(report: dict) -> plagiarism_pb2.ExactMatchReport:
    """Map the exact-match dict from SimilarityService onto its protobuf message."""
    return plagiarism_pb2.ExactMatchReport(
        total_tokens=report["total_tokens"],
        matched_tokens=report["matched_tokens"],
        overall_ratio=report["overall_ratio"],
        quoted_tokens=report["quoted_tokens"],
        reference_tokens_skipped=report["reference_tokens_skipped"],
        sources=[
            plagiarism_pb2.ExactMatchSource(
                doc_id=source["doc_id"],
                source_kind=source["source_kind"],
                source_ref=source["source_ref"],
                title=source["title"],
                source_url=source["source_url"],
                matched_tokens=source["matched_tokens"],
                overlap_ratio=source["overlap_ratio"],
                spans=[
                    plagiarism_pb2.ExactMatchSpan(
                        submission_start_token=span["submission_start_token"],
                        submission_end_token=span["submission_end_token"],
                        submission_snippet=span["submission_snippet"],
                        matched_snippet=span["matched_snippet"],
                        token_length=span["token_length"],
                        quoted=span["quoted"],
                    )
                    for span in source["spans"]
                ],
                **(
                    {"submission_id": source["submission_id"]}
                    if source.get("submission_id")
                    else {}
                ),
            )
            for source in report["sources"]
        ],
    )


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
            submission_id = (
                request.submission_id if request.HasField("submission_id") else None
            )
            raw = await self._similarity.detect_corpus_similarity(
                request.submission_text,
                threshold=threshold,
                category=category,
                submission_id=submission_id,
            )
            response = plagiarism_pb2.DetectCorpusSimilarityResponse(
                local_matches=[
                    plagiarism_pb2.CorpusSimilarityMatch(
                        submission_chunk_index=m["submission_chunk_index"],
                        submission_snippet=m["submission_snippet"],
                        source_article_id=m["source_article_id"],
                        source_chunk_index=m["source_chunk_index"],
                        matched_snippet=m["matched_snippet"],
                        similarity=m["similarity"],
                    )
                    for m in raw["local_matches"]
                ],
                web_matches=[
                    plagiarism_pb2.WebSimilarityMatch(
                        query_snippet=m["query_snippet"],
                        source_url=m["source_url"],
                        matched_snippet=m["matched_snippet"],
                        similarity=m["similarity"],
                    )
                    for m in raw["web_matches"]
                ],
            )
            exact = raw.get("exact_report")
            if exact is not None:
                response.exact_matches.CopyFrom(_exact_report_message(exact))
            if raw.get("local_error"):
                response.local_error = raw["local_error"]
            if raw.get("web_error"):
                response.web_error = raw["web_error"]
            if raw.get("exact_error"):
                response.exact_error = raw["exact_error"]
            return response
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
