/**
 * A request Studio refused, carrying the reason it gave, the code that says
 * what the UI can do about it, and the rest of its answer — a refused file
 * plan comes back with the plan as it stands, for the UI to show.
 *
 * @example
 * ```ts
 * try {
 *   await post("/api/apis/write", body);
 * } catch (error) {
 *   if (error instanceof StudioRequestError && error.code === "NEEDS_CONFIRMATION") showPlan(error.data.plan);
 * }
 * ```
 */
export class StudioRequestError extends Error {
  /** Studio's code for the refusal, when it gave one. */
  readonly code: string | undefined;
  /** The whole answer, `error` and `code` included. */
  readonly data: Readonly<Record<string, unknown>>;

  /**
   * @param reason - The reason Studio gave
   * @param data - Studio's whole answer
   * @param cause - The HTTP error the answer came with
   */
  constructor(reason: string, data: Record<string, unknown>, cause: unknown) {
    super(reason, { cause });
    this.name = "StudioRequestError";
    this.code = typeof data.code === "string" && data.code !== "" ? data.code : undefined;
    this.data = data;
  }
}
