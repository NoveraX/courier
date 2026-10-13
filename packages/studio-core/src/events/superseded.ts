import type { StudioEvent } from "./types";

/** A call cancelled by a newer one to its endpoint, which the API asks of with `cancelPrevious`. */
export interface CallSupersededEvent extends StudioEvent {
  type: "call:superseded";
  /** The endpoint the two calls went to. */
  key: string;
}
