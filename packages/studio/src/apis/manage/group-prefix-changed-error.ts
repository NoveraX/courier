import { CourierError } from "@noverax/courier";

/**
 * The specification moved a group's endpoints under another prefix than
 * the group file declares, so an endpoint added to it would be written
 * relative to the wrong one and call the wrong URL. Nothing is written.
 * Answered 409: the import is updated first, which writes the group with
 * its new prefix, and endpoints are added after.
 *
 * @example
 * ```ts
 * throw new GroupPrefixChangedError("src/api/shop/v1/index.ts", "/v1/customers", "/v1");
 * ```
 */
export class GroupPrefixChangedError extends CourierError<"GROUP_PREFIX_CHANGED"> {
  /** The status a route answers with. */
  readonly httpStatus = 409;

  /**
   * @param path - The group file, project-relative
   * @param onDisk - The prefix the file declares
   * @param generated - The prefix the specification gives the group now
   */
  constructor(path: string, onDisk: string | null, generated: string | null) {
    super(
      `${path} declares the prefix ${JSON.stringify(onDisk)}, but the spec now puts its endpoints under ${JSON.stringify(generated)}. Update the import first, then add endpoints.`,
      { code: "GROUP_PREFIX_CHANGED", context: { path, onDisk, generated } },
    );
  }
}
