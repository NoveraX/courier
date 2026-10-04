import { CourierError } from "@noverax/courier";

/** Why a mock was refused its target */
export type MockTargetErrorCode = "COLLECTION_MISMATCH";

/**
 * A mock named under another collection than the one its endpoint is filed
 * under. An endpoint declared outside any group is filed under the
 * collection its path starts with; a mock under another name would register
 * a second handler, and a call naming no group would match two and be
 * answered 404.
 *
 * @example
 * ```ts
 * mock("people", "listUsers"); // listUsers is declared as endpoint.get("users")
 * // → MockTargetError: ... mock("users", "listUsers")
 * ```
 */
export class MockTargetError extends CourierError<MockTargetErrorCode> {
  /**
   * @param named      The collection the mock was named under
   * @param method     The endpoint's name
   * @param collection The collection the endpoint is filed under
   */
  constructor(named: string, method: string, collection: string) {
    super(
      `[courier-mock] "${method}" is declared outside any group and filed under the collection its path starts with, "${collection}": mock("${collection}", "${method}"), not mock("${named}", "${method}").`,
      { code: "COLLECTION_MISMATCH", context: { group: named, method, collection } },
    );
  }
}
