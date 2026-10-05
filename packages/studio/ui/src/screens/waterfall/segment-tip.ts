import type { SegmentKey } from "@/features/waterfall/bar-segments";

/** The part of a bar under the pointer, and where the pointer is. */
export interface SegmentTip {
  requestId: string;
  key: SegmentKey;
  duration: number;
  total: number;
  x: number;
  y: number;
}
