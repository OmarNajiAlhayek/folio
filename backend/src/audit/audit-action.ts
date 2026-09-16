export const AuditActionType = {
  // Auth lifecycle
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  REGISTER: 'REGISTER',
  TOKEN_REFRESH: 'TOKEN_REFRESH',
  VERIFY_EMAIL: 'VERIFY_EMAIL',
  PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  SESSION_REVOKE: 'SESSION_REVOKE',
  ORCID_UNLINK: 'ORCID_UNLINK',
  // State transitions
  STATE_CHANGE: 'STATE_CHANGE',
  // Permission management
  PERMISSION_CHANGE: 'PERMISSION_CHANGE',
  // File operations
  FILE_UPLOAD: 'FILE_UPLOAD',
  FILE_DOWNLOAD: 'FILE_DOWNLOAD',
  FILE_DELETE: 'FILE_DELETE',
  // Standard CRUD
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  VIEW: 'VIEW',
  // Catch-all for other POSTs
  ACTION: 'ACTION',
} as const;

export type AuditActionType =
  (typeof AuditActionType)[keyof typeof AuditActionType];

export const AuditResourceType = {
  SUBMISSION: 'submission',
  ASSIGNMENT: 'assignment',
  COPYEDIT_ASSIGNMENT: 'copyedit_assignment',
  REVIEW: 'review',
  USER: 'user',
  ROLE_INVITATION: 'role_invitation',
  REMINDER: 'reminder',
  NOTIFICATION: 'notification',
  SESSION: 'session',
  AUTH: 'auth',
  AUDIT_LOG: 'audit_log',
  EMAIL_ADMIN: 'email_admin',
  SEARCH_CONFIG: 'search_config',
  PUBLIC_SUBMISSION: 'public_submission',
  JOURNAL: 'journal',
  EDITORIAL_BOARD: 'editorial_board',
  UNKNOWN: 'unknown',
} as const;

export type AuditResourceType =
  (typeof AuditResourceType)[keyof typeof AuditResourceType];

const RESOURCE_BY_FIRST_SEGMENT: Record<string, AuditResourceType> = {
  auth: AuditResourceType.AUTH,
  submissions: AuditResourceType.SUBMISSION,
  users: AuditResourceType.USER,
  assignments: AuditResourceType.ASSIGNMENT,
  'copyedit-assignments': AuditResourceType.COPYEDIT_ASSIGNMENT,
  'role-invitations': AuditResourceType.ROLE_INVITATION,
  notifications: AuditResourceType.NOTIFICATION,
  audit: AuditResourceType.AUDIT_LOG,
  public: AuditResourceType.PUBLIC_SUBMISSION,
  journals: AuditResourceType.JOURNAL,
};

// Nested segments that refine the resource to a child entity
const SUB_RESOURCE_REFINEMENTS: Record<string, AuditResourceType> = {
  assignments: AuditResourceType.ASSIGNMENT,
  reviews: AuditResourceType.REVIEW,
  'copyedit-assignments': AuditResourceType.COPYEDIT_ASSIGNMENT,
  reminders: AuditResourceType.REMINDER,
  'role-invitations': AuditResourceType.ROLE_INVITATION,
  sessions: AuditResourceType.SESSION,
  'editorial-board': AuditResourceType.EDITORIAL_BOARD,
};

const SPECIFIC_ACTION_BY_SEGMENT: Record<string, AuditActionType> = {
  login: AuditActionType.LOGIN,
  logout: AuditActionType.LOGOUT,
  register: AuditActionType.REGISTER,
  refresh: AuditActionType.TOKEN_REFRESH,
  'verify-email': AuditActionType.VERIFY_EMAIL,
  'forgot-password': AuditActionType.PASSWORD_RESET_REQUEST,
  'reset-password': AuditActionType.PASSWORD_RESET,
  'revoke-others': AuditActionType.SESSION_REVOKE,
  unlink: AuditActionType.ORCID_UNLINK,
};

// POST to these endings always means a state transition
const STATE_CHANGE_ENDINGS = new Set([
  'submit',
  'publish',
  'accept',
  'decline',
  'cancel',
  'ready',
  'approve-ready',
  'requeue',
  'replay',
  'reindex',
]);

// Priority order for extracting the primary resource id from route params
const RESOURCE_ID_PARAM_PRIORITY = [
  'slug',
  'id',
  'submissionSlug',
  'assignmentSlug',
  'reminderId',
  'fileId',
  'templateKey',
  'jobId',
];

function stripApiPrefix(pattern: string): string {
  return pattern.replace(/^\/api\/v\d+/, '').replace(/^\//, '');
}

function isParam(segment: string): boolean {
  return segment.startsWith(':');
}

export function classifyAuditAction(
  method: string,
  routePattern: string | null,
  path: string,
  statusCode: number,
  params: Record<string, unknown> | null,
): {
  actionType: AuditActionType;
  resourceType: AuditResourceType;
  resourceId: string | null;
} {
  const source = routePattern ?? path;
  const normalized = stripApiPrefix(source);
  const segments = normalized.split('/').filter(Boolean);

  const firstSeg = segments[0] ?? '';
  const lastSeg = segments[segments.length - 1] ?? '';

  // --- resource_type ---
  let resourceType: AuditResourceType =
    RESOURCE_BY_FIRST_SEGMENT[firstSeg] ?? AuditResourceType.UNKNOWN;

  if (firstSeg === 'admin') resourceType = AuditResourceType.EMAIL_ADMIN;
  if (firstSeg === 'editor') resourceType = AuditResourceType.SEARCH_CONFIG;

  // Refine to child entity by scanning for known nested resource nouns
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (!isParam(seg) && SUB_RESOURCE_REFINEMENTS[seg]) {
      resourceType = SUB_RESOURCE_REFINEMENTS[seg]!;
    }
  }

  // auth/sessions is a SESSION resource
  if (firstSeg === 'auth' && segments.includes('sessions')) {
    resourceType = AuditResourceType.SESSION;
  }

  const hasFileSegment = segments.includes('files');

  // --- resource_id ---
  let resourceId: string | null = null;
  if (params) {
    for (const key of RESOURCE_ID_PARAM_PRIORITY) {
      const raw = params[key];
      if (typeof raw === 'string' || typeof raw === 'number') {
        resourceId = String(raw);
        break;
      }
    }
  }

  // --- action_type ---
  let actionType: AuditActionType;

  // Named auth endpoints take priority
  if (SPECIFIC_ACTION_BY_SEGMENT[lastSeg] && !isParam(lastSeg)) {
    actionType = SPECIFIC_ACTION_BY_SEGMENT[lastSeg]!;
  }
  // PATCH auth/me/password  or  POST auth/me/password (set password)
  else if (firstSeg === 'auth' && lastSeg === 'password') {
    actionType = AuditActionType.PASSWORD_CHANGE;
  }
  // Role changes: PATCH :id/roles  or  POST :id/role-invitations
  else if (lastSeg === 'roles' && method === 'PATCH') {
    actionType = AuditActionType.PERMISSION_CHANGE;
  } else if (lastSeg === 'role-invitations' && method === 'POST') {
    actionType = AuditActionType.PERMISSION_CHANGE;
  } else if (
    resourceType === AuditResourceType.ROLE_INVITATION &&
    (lastSeg === 'accept' || lastSeg === 'decline')
  ) {
    actionType = AuditActionType.PERMISSION_CHANGE;
  }
  // State transitions via POST
  else if (STATE_CHANGE_ENDINGS.has(lastSeg) && method === 'POST') {
    actionType = AuditActionType.STATE_CHANGE;
  }
  // Status change via PATCH
  else if (lastSeg === 'status' && method === 'PATCH') {
    actionType = AuditActionType.STATE_CHANGE;
  }
  // Session revoke via DELETE
  else if (resourceType === AuditResourceType.SESSION && method === 'DELETE') {
    actionType = AuditActionType.SESSION_REVOKE;
  }
  // File operations
  else if (hasFileSegment) {
    if (method === 'POST') actionType = AuditActionType.FILE_UPLOAD;
    else if (method === 'GET') actionType = AuditActionType.FILE_DOWNLOAD;
    else if (method === 'DELETE') actionType = AuditActionType.FILE_DELETE;
    else actionType = AuditActionType.ACTION;
  }
  // Standard HTTP method → CRUD
  else if (method === 'GET') {
    actionType = AuditActionType.VIEW;
  } else if (method === 'DELETE') {
    actionType = AuditActionType.DELETE;
  } else if (method === 'PATCH' || method === 'PUT') {
    actionType = AuditActionType.UPDATE;
  } else if (method === 'POST') {
    // 201 Created = new resource; 200 = acting on existing resource
    actionType =
      statusCode === 201 ? AuditActionType.CREATE : AuditActionType.ACTION;
  } else {
    actionType = AuditActionType.ACTION;
  }

  return { actionType, resourceType, resourceId };
}
