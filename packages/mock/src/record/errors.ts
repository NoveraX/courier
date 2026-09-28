import { CourierError } from "@noverax/courier";

/** Why the recorder refused a call */
export type RecorderErrorCode = "RECORDING_NOT_FOUND" | "ENDPOINT_EXCLUDED";

/**
 * A call the recorder cannot answer: one replay mode has no recording of,
 * or one its `filter` excludes.
 *
 * @example
 * ```ts
 * try {
 *   await recorder.client.users.getById({ id: 2 });
 * } catch (error) {
 *   if (error instanceof RecorderError && error.code === "RECORDING_NOT_FOUND") record();
 * }
 * ```
 */
export class RecorderError extends CourierError<RecorderErrorCode> {
  /**
   * @param code      Why the call was refused
   * @param group     The endpoint's group, empty for a top-level endpoint
   * @param method    The endpoint's name
   * @param variables The call's variables
   */
  constructor(code: RecorderErrorCode, group: string, method: string, variables: unknown) {
    const name = group ? `${group}.${method}` : method;
    const message =
      code === "RECORDING_NOT_FOUND"
        ? `[courier-mock/recorder] No recording of ${name} for ${JSON.stringify(variables ?? null)}`
        : `[courier-mock/recorder] Endpoint "${name}" excluded by filter`;
    super(message, { code, context: { group, method } });
  }
}
