import { apiJson } from '@/lib/api';
import type { AuditLogListResult } from '@/lib/audit';

export async function fetchAuditLogs(params: {
  userId?: string;
  startDate?: string;
  endDate?: string;
  method?: string;
  actionType?: string;
  resourceType?: string;
  resourceId?: string;
  page: number;
  limit: number;
}): Promise<AuditLogListResult> {
  const sp = new URLSearchParams();
  if (params.userId) sp.set('userId', params.userId);
  if (params.startDate) sp.set('startDate', params.startDate);
  if (params.endDate) sp.set('endDate', params.endDate);
  if (params.method) sp.set('method', params.method);
  if (params.actionType) sp.set('actionType', params.actionType);
  if (params.resourceType) sp.set('resourceType', params.resourceType);
  if (params.resourceId) sp.set('resourceId', params.resourceId);
  sp.set('page', String(params.page));
  sp.set('limit', String(params.limit));
  return apiJson<AuditLogListResult>(`/audit/logs?${sp.toString()}`);
}
