import { CourierError } from "@noverax/courier";

/**
 * A URL import's `pinHash` names another specification than the one at
 * hand: the pin says which specification the project builds from, so
 * nothing is generated from another. Answered 409: the pin is changed in
 * courier.config, or the specification goes back to the pinned one.
 *
 * @example
 * ```ts
 * throw new SpecPinMismatchError("petstore", "3f2a…", "9c1e…");
 * ```
 */
export class SpecPinMismatchError extends CourierError<"SPEC_PIN_MISMATCH"> {
  /** The status a route answers with. */
  readonly httpStatus = 409;

  /**
   * @param importName - The import's key under `imports`
   * @param pinned - The hash its `pinHash` names
   * @param actual - The hash of the specification at hand
   */
  constructor(importName: string, pinned: string, actual: string) {
    super(
      `The specification of "${importName}" hashes to ${actual}, but its pinHash in courier.config is ${pinned}. Update the pinHash to take this specification.`,
      { code: "SPEC_PIN_MISMATCH", context: { importName, pinned, actual } },
    );
  }
}
