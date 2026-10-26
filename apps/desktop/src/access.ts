export type AccessStatus = { configured: boolean; unlocked: boolean };

export function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

export function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error;
  return typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : fallback;
}
