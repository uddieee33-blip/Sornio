import type { PortalId } from '../../../packages/business-domain/src/business-types';

export type Draft = { businessName: string; businessType: PortalId; note: string };
export type Snapshot = { revision: number; draft: Draft | null };
export type SavedCopy = { revision: number; draft: Draft };
