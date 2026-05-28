from __future__ import annotations

import grpc
from folio.ai.v1 import reviewer_pb2, reviewer_pb2_grpc

from app.grpc.errors import abort_mapped
from app.services.reviewer_matching_grpc_service import ReviewerMatchingGrpcService


class ReviewerMatchingGrpcServicer(reviewer_pb2_grpc.ReviewerMatchingServiceServicer):
    def __init__(self, reviewer_service: ReviewerMatchingGrpcService) -> None:
        self._reviewer = reviewer_service

    async def SuggestReviewers(
        self,
        request: reviewer_pb2.SuggestReviewersRequest,
        context: grpc.aio.ServicerContext,
    ) -> reviewer_pb2.SuggestReviewersResponse:
        try:
            profiles = [
                {
                    "reviewer_id": p.reviewer_id,
                    "affiliation": p.affiliation,
                    "review_keywords": p.review_keywords,
                    "display_name": p.display_name,
                }
                for p in request.index_profiles
            ]
            history = [
                {
                    "reviewer_id": h.reviewer_id,
                    "submission_id": h.submission_id,
                    "abstract": h.abstract,
                    "keywords": h.keywords,
                }
                for h in request.index_history
            ]
            items = await self._reviewer.suggest_reviewers(
                query_text=request.query_text,
                limit=request.limit if request.HasField("limit") else None,
                candidate_ids=list(request.candidate_ids),
                exclude_reviewer_ids=list(request.exclude_reviewer_ids),
                index_profiles=profiles,
                index_history=history,
                use_cross_encoder=(
                    request.use_cross_encoder
                    if request.HasField("use_cross_encoder")
                    else True
                ),
            )
            hits_pb: list[reviewer_pb2.ReviewerSuggestionHit] = []
            for item in items:
                hit = reviewer_pb2.ReviewerSuggestionHit(
                    reviewer_id=item["reviewer_id"],
                    final_score=item["final_score"],
                    bio_score=item["bio_score"],
                    history_score=item["history_score"],
                    used_cross_encoder=bool(item["used_cross_encoder"]),
                )
                if item.get("ce_bio_score") is not None:
                    hit.ce_bio_score = item["ce_bio_score"]
                if item.get("ce_history_score") is not None:
                    hit.ce_history_score = item["ce_history_score"]
                hits_pb.append(hit)
            return reviewer_pb2.SuggestReviewersResponse(hits=hits_pb)
        except Exception as exc:
            await abort_mapped(context, exc)
            raise
