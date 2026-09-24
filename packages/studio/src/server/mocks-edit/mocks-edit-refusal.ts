import { CourierError } from "@noverax/courier";
import type { RefusalCode } from "./types";

/** Codes after which asking again may succeed without the user changing anything. */
const RETRYABLE: ReadonlySet<RefusalCode> = new Set([
  "STUDIO_STARTING",
  "STUDIO_BUSY",
  "CONFIG_LOAD_FAILING",
  "MOCKS_LOAD_FAILING",
  "MOCKS_CHANGED_SINCE_LOAD",
]);

/**
 * Studio will not edit `courier.mocks.ts` itself, for the reason given; the
 * user gets a snippet to add by hand instead.
 */
export class MocksEditRefusal extends CourierError<RefusalCode> {
  /** The source the refusal concerns, or `null` when it concerns the whole edit. */
  readonly source: string | null;

  constructor(
    code: RefusalCode,
    message: string,
    options: { source?: string | null; cause?: unknown } = {},
  ) {
    super(message, { code, cause: options.cause });
    this.source = options.source ?? null;
  }

  /** Whether asking again may succeed without the user changing anything. */
  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}
