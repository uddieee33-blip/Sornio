export type CompanionErrorCode =
  | 'UNAUTHENTICATED'
  | 'REAUTH_REQUIRED'
  | 'ACCESS_REVOKED'
  | 'FORBIDDEN'
  | 'BUSINESS_MISMATCH'
  | 'GENERATION_MISMATCH'
  | 'STALE_SNAPSHOT'
  | 'DUPLICATE_SYNC'
  | 'OUT_OF_ORDER_SYNC'
  | 'INVALID_PAYLOAD'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'OFFLINE'
  | 'PRODUCTION_DISABLED'
  | 'DEMO_FORBIDDEN'
  | 'CACHE_UNAVAILABLE'
  | 'UNSUPPORTED';

export class CompanionError extends Error {
  readonly code: CompanionErrorCode;
  readonly retryable: boolean;
  constructor(code: CompanionErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'CompanionError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function isCompanionError(value: unknown): value is CompanionError {
  return value instanceof CompanionError;
}
