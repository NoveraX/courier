/**
 * How a read got its answer without a request of its own: it joined the
 * identical read already in flight, or the render it was made in had read
 * the same thing already. `with` names the call whose request answered, as
 * Studio knows it, when that call was measured.
 */
export interface SharedAnswer {
  readonly by: "flight" | "render";
  readonly with?: string | undefined;
}

/**
 * A call as the requests it shares know it: its Studio id, which a later
 * identical read names as the call whose request answered it, and what to
 * tell when this call's own answer comes from another call's request.
 * Never part of what makes two requests identical.
 */
export interface SharingCall {
  readonly id?: string | undefined;
  readonly onShared?: ((answer: SharedAnswer) => void) | undefined;
}
