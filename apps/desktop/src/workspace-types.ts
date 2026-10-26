import type { PortalId } from '../../../lib/portals/types';

export type Draft = { businessName: string; businessType: PortalId; note: string };
export type Snapshot = { revision: number; draft: Draft | null };
export type SavedCopy = { revision: number; draft: Draft };
