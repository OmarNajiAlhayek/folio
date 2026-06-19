/** Keep aligned with backend `audit-action.ts` */
export const AUDIT_ACTION_TYPES = [
  'LOGIN',
  'LOGOUT',
  'REGISTER',
  'TOKEN_REFRESH',
  'VERIFY_EMAIL',
  'PASSWORD_RESET_REQUEST',
  'PASSWORD_RESET',
  'PASSWORD_CHANGE',
  'SESSION_REVOKE',
  'ORCID_UNLINK',
  'STATE_CHANGE',
  'PERMISSION_CHANGE',
  'FILE_UPLOAD',
  'FILE_DOWNLOAD',
  'FILE_DELETE',
  'CREATE',
  'UPDATE',
  'DELETE',
  'VIEW',
  'ACTION',
] as const;

export type AuditActionType = (typeof AUDIT_ACTION_TYPES)[number];

export const AUDIT_RESOURCE_TYPES = [
  'submission',
  'assignment',
  'copyedit_assignment',
  'review',
  'user',
  'role_invitation',
  'reminder',
  'notification',
  'session',
  'auth',
  'audit_log',
  'email_admin',
  'search_config',
  'public_submission',
  'unknown',
] as const;

export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number];

export type AuditLogRow = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userRoles: string[] | null;
  method: string;
  routePattern: string | null;
  path: string;
  statusCode: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestBody: Record<string, unknown> | null;
  params: Record<string, unknown> | null;
  durationMs: number | null;
  occurredAt: string;
  error: string | null;
  actionType: AuditActionType | null;
  resourceType: AuditResourceType | null;
  resourceId: string | null;
};

export type AuditLogListResult = {
  items: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
};
