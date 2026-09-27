import { CourierError } from "@noverax/courier";

/**
 * An endpoint being added to a group file would call a URL that the prefix
 * the file declares cannot reach, or the file declares its prefix in a way
 * Studio cannot read, so it cannot tell where the endpoint would go. Nothing
 * is written. Answered 409: the endpoint is added by hand, or the API is
 * imported again under the same name, which keeps the endpoints the user
 * edited.
 *
 * @example
 * ```ts
 * throw new EndpointOutsidePrefixError("src/api/shop/v1/index.ts", "listCharges", "v1/charges", "/v1/customers");
 * ```
 */
export class EndpointOutsidePrefixError extends CourierError<"ENDPOINT_OUTSIDE_PREFIX"> {
  /** The status a route answers with. */
  readonly httpStatus = 409;

  /**
   * @param path - The group file, project-relative
   * @param endpoint - The endpoint being added
   * @param url - The path it calls, from the API's base URL
   * @param prefix - The prefix the file declares, or `null` when Studio cannot read it
   */
  constructor(path: string, endpoint: string, url: string, prefix: string | null) {
    const why =
      prefix === null
        ? `Studio cannot read the prefix ${path} declares, so it cannot tell where ${endpoint} would go`
        : `${endpoint} calls /${url}, which is not under the prefix ${JSON.stringify(prefix)} that ${path} declares`;
    super(
      `${why}. Add it there by hand, or import the API again under the same name, which keeps the endpoints you edited.`,
      { code: "ENDPOINT_OUTSIDE_PREFIX", context: { path, endpoint, url, prefix } },
    );
  }
}
