/**
 * Stable REST API error `code` values and defaults for HTTP status + user-facing `message`.
 * Handlers should import codes (and optionally `sendKnownRestError`) so responses stay consistent
 * with [docs/api-error-codes.md](../../docs/api-error-codes.md).
 */

export const REST_ERROR_CODES = {
  REGISTER_PASSWORD_INVALID: "REGISTER_PASSWORD_INVALID",
  REGISTER_FAILED: "REGISTER_FAILED",
  AUTH_SERVER_MISCONFIGURED: "AUTH_SERVER_MISCONFIGURED",
  REGISTER_USER_ID_CONFLICT: "REGISTER_USER_ID_CONFLICT",
  AUTH_BODY_INVALID: "AUTH_BODY_INVALID",
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_SESSION_MISSING: "AUTH_SESSION_MISSING",
  AUTH_SESSION_INVALID: "AUTH_SESSION_INVALID",
  CONFIG_BODY_INVALID: "CONFIG_BODY_INVALID",
  CONFIG_PROVIDER_URL_NOT_ALLOWED: "CONFIG_PROVIDER_URL_NOT_ALLOWED",
  CONFIG_ALREADY_EXISTS: "CONFIG_ALREADY_EXISTS",
  QUEUE_BACKLOG_EXCEEDED: "QUEUE_BACKLOG_EXCEEDED",
  HASH_SYNC_ALREADY_ACTIVE: "HASH_SYNC_ALREADY_ACTIVE",
  HASH_CONFIG_NOT_FOUND: "HASH_CONFIG_NOT_FOUND",
  HASH_NOT_LINKED_TO_USER: "HASH_NOT_LINKED_TO_USER",
  HASH_CANCEL_NOT_AUTHORIZED: "HASH_CANCEL_NOT_AUTHORIZED",
  HASH_NO_ACTIVE_SYNC_TO_CANCEL: "HASH_NO_ACTIVE_SYNC_TO_CANCEL",
  CHANGE_PASSWORD_BODY_INVALID: "CHANGE_PASSWORD_BODY_INVALID",
  CHANGE_PASSWORD_CURRENT_INVALID: "CHANGE_PASSWORD_CURRENT_INVALID",
} as const;

export const REST_ERROR_DEFINITIONS = {
  [REST_ERROR_CODES.REGISTER_PASSWORD_INVALID]: {
    httpStatus: 400,
    message: "Password must be at least 8 characters",
    remediation: "Use a password with at least 8 characters.",
  },
  [REST_ERROR_CODES.REGISTER_FAILED]: {
    httpStatus: 500,
    message: "Could not create account",
    remediation: "Retry later. If the problem continues, contact support.",
  },
  [REST_ERROR_CODES.AUTH_SERVER_MISCONFIGURED]: {
    httpStatus: 503,
    message: "Server session signing is not configured",
    remediation: "Set SESSION_JWT_SECRET (and related session env) on the server.",
  },
  [REST_ERROR_CODES.REGISTER_USER_ID_CONFLICT]: {
    httpStatus: 409,
    message: "Account creation conflict; try again",
    remediation: "Submit registration again; a rare identifier collision occurred.",
  },
  [REST_ERROR_CODES.AUTH_BODY_INVALID]: {
    httpStatus: 400,
    message: "userId and password are required",
    remediation: "Send a JSON body with non-empty userId and password.",
  },
  [REST_ERROR_CODES.AUTH_INVALID_CREDENTIALS]: {
    httpStatus: 401,
    message: "Invalid user id or password",
    remediation: "Check the user id and password, or register a new account.",
  },
  [REST_ERROR_CODES.AUTH_SESSION_MISSING]: {
    httpStatus: 401,
    message: "Session cookie required",
    remediation:
      "Call POST /api/auth/login or POST /api/auth/register so the response sets the session cookie.",
  },
  [REST_ERROR_CODES.AUTH_SESSION_INVALID]: {
    httpStatus: 403,
    message: "Invalid or expired session",
    remediation: "Log in again to receive a new session cookie.",
  },
  [REST_ERROR_CODES.CONFIG_BODY_INVALID]: {
    httpStatus: 400,
    message: "Invalid config payload or hash path",
    remediation:
      'POST/PUT: JSON with type "xtream" or "direct" and required fields. DELETE/PUT /api/configs/:hash: non-empty URL-encoded hash.',
  },
  [REST_ERROR_CODES.CONFIG_PROVIDER_URL_NOT_ALLOWED]: {
    httpStatus: 400,
    message: "Provider URL is not allowed",
    remediation:
      "Use a public http or https URL for the panel, M3U, or EPG. Private, localhost, and metadata addresses are blocked.",
  },
  [REST_ERROR_CODES.CONFIG_ALREADY_EXISTS]: {
    httpStatus: 409,
    message: "A config with this provider is already linked to your account",
    remediation:
      "Use PUT /api/configs/:hash to rename or change provider fields, or pick a different provider.",
  },
  [REST_ERROR_CODES.QUEUE_BACKLOG_EXCEEDED]: {
    httpStatus: 429,
    message: "Prefetch queue backlog is too large",
    remediation:
      "Wait and retry later, or ask the operator to raise FETCH_MAX_BACKLOG_HOURS after capacity review.",
  },
  [REST_ERROR_CODES.HASH_SYNC_ALREADY_ACTIVE]: {
    httpStatus: 409,
    message: "A catalog sync is already queued or running for this hash",
    remediation:
      "Wait for the current sync to finish or fail before enqueueing another job for the same config hash.",
  },
  [REST_ERROR_CODES.HASH_CONFIG_NOT_FOUND]: {
    httpStatus: 500,
    message: "Config hash is missing from the database",
    remediation: "This is an unexpected server state; retry or contact support if it persists.",
  },
  [REST_ERROR_CODES.HASH_NOT_LINKED_TO_USER]: {
    httpStatus: 403,
    message: "This config hash is not linked to your account",
    remediation:
      "Add the provider config via POST /api/configs or use an account that owns this hash.",
  },
  [REST_ERROR_CODES.HASH_CANCEL_NOT_AUTHORIZED]: {
    httpStatus: 403,
    message: "Only the user who started this sync may cancel it",
    remediation: "Wait for the sync to finish, or ask the user who triggered the job to cancel it.",
  },
  [REST_ERROR_CODES.HASH_NO_ACTIVE_SYNC_TO_CANCEL]: {
    httpStatus: 409,
    message: "No queued or running prefetch job to cancel for this hash",
    remediation:
      "Cancel applies only while a job is queued, running, or fetching; enqueue a refetch first if needed.",
  },
  [REST_ERROR_CODES.CHANGE_PASSWORD_BODY_INVALID]: {
    httpStatus: 400,
    message: "currentPassword and newPassword are required",
    remediation: "Send a JSON body with non-empty currentPassword and newPassword strings.",
  },
  [REST_ERROR_CODES.CHANGE_PASSWORD_CURRENT_INVALID]: {
    httpStatus: 401,
    message: "Current password is incorrect",
    remediation: "Re-enter your current password, or log out and use forgot-flow if supported.",
  },
} as const;
