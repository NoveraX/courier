import { CourierError } from "@noverax/courier";

/** Why Studio will not plan or write a test of recorded calls. */
export type RecordedTestRefusalCode =
  | "INVALID_REQUEST"
  | "SESSION_NOT_FOUND"
  | "NO_RUNNING_CONFIG"
  | "NO_ANSWERED_CALLS"
  | "MOCK_PACKAGE_MISSING"
  | "PLAN_CHANGED"
  | "FILE_EXISTS";

const STATUS: Readonly<Record<RecordedTestRefusalCode, number>> = {
  INVALID_REQUEST: 400,
  SESSION_NOT_FOUND: 404,
  NO_RUNNING_CONFIG: 409,
  NO_ANSWERED_CALLS: 400,
  MOCK_PACKAGE_MISSING: 424,
  PLAN_CHANGED: 409,
  FILE_EXISTS: 409,
};

/**
 * Studio will not plan or write a test of a session's calls, for the reason
 * given, which the person is shown as it is.
 *
 * @example
 * ```ts
 * throw new RecordedTestRefusal("NO_ANSWERED_CALLS", "None of these requests has an answer to check.");
 * ```
 */
export class RecordedTestRefusal extends CourierError<RecordedTestRefusalCode> {
  /**
   * @param code - Why Studio refuses
   * @param message - What the person is told
   * @param options - What was thrown, when the refusal comes of a failure
   */
  constructor(code: RecordedTestRefusalCode, message: string, options: { cause?: unknown } = {}) {
    super(message, { code, cause: options.cause });
  }

  /** The HTTP status Studio answers with. */
  get httpStatus(): number {
    return STATUS[this.code];
  }
}
