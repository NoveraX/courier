import type { StudioEvent } from "./types";

/** A call cancelled by a newer one to its endpoint, as its `cancelPrevious` asks. */
export interface CallSupersededEvent extends StudioEvent {
  type: "call:superseded";
  /** The endpoint the two calls went to. */
  key: string;
}
