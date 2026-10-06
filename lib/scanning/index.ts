/**
 * Scanning & capture — the public surface.
 *
 * Everything a screen needs, in one import:
 *
 *   import { resolveScan, encodeForLabel, detectCaptureReadiness } from '@/lib/scanning';
 */

export * from './types';
export * from './barcodes';
export * from './encoder';
export * from './match';
export * from './counter';
export * from './device';
export * from './fingerprint';
