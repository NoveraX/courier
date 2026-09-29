// Re-export shared constants used by timeline components

export type { DetailTabKey } from "@/components/shared/detail-panel/constants";
export {
  DETAIL_TABS,
  HTTP_METHOD_COLORS,
  STATUS_CONFIG,
} from "@/components/shared/detail-panel/constants";

// ── Timeline-specific constants ───────────────────────────────────────────

import type { DensityMode } from "@/store/types";

export const ROW_HEIGHT = 36;
export const ROW_HEIGHTS: Record<DensityMode, number> = {
  comfortable: 36,
  compact: 28,
};
export const OVERSCAN = 15;
