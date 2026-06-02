from __future__ import annotations

import grpc
from folio.ai.v1 import copyedit_pb2, copyedit_pb2_grpc

from app.grpc.errors import abort_mapped
from app.services.copyedit_analysis_service import CopyeditAnalysisService


class CopyeditGrpcServicer(copyedit_pb2_grpc.CopyeditServiceServicer):
    def __init__(self, copyedit_service: CopyeditAnalysisService) -> None:
        self._copyedit = copyedit_service

    async def CheckReferences(
        self,
        request: copyedit_pb2.CheckReferencesRequest,
        context: grpc.aio.ServicerContext,
    ) -> copyedit_pb2.CheckReferencesResponse:
        try:
            issues = await self._copyedit.check_references(
                reference_list=list(request.reference_list),
                inline_citations=list(request.inline_citations),
            )
            return copyedit_pb2.CheckReferencesResponse(issues=issues)
        except Exception as exc:
            await abort_mapped(context, exc)

    async def GetCopyeditStatus(
        self,
        _request: copyedit_pb2.GetCopyeditStatusRequest,
        context: grpc.aio.ServicerContext,
    ) -> copyedit_pb2.CopyeditStatus:
        try:
            status = self._copyedit.status()
            return copyedit_pb2.CopyeditStatus(enabled=bool(status["enabled"]))
        except Exception as exc:
            await abort_mapped(context, exc)
