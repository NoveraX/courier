import { CourierError } from "@noverax/courier";

/** One option a write gives otherwise than the import's declaration. */
export interface DeclarationDifference {
  /** The option, such as `validation`, or `folder` for where the files go. */
  option: string;
  declared: string;
  requested: string;
}

function listed(
  differences: readonly DeclarationDifference[],
  side: "declared" | "requested",
): string {
  const parts = differences.map((difference) => `${difference.option} ${difference[side]}`);
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * A write for an import gives options other than those courier.config
 * declares for it. Writing into another directory while cleaning the
 * declared one would delete files the write never touched, and files
 * generated with other options would be regenerated as declared by the
 * next update or change to endpoints, mixing the two. Nothing is written.
 * Answered 409: the declaration or the request has to change first.
 *
 * @example
 * ```ts
 * throw new DeclarationMismatchError("pets", [{ option: "validation", declared: "zod", requested: "valibot" }]);
 * ```
 */
export class DeclarationMismatchError extends CourierError<"DECLARATION_MISMATCH"> {
  /** The status a route answers with. */
  readonly httpStatus = 409;

  /**
   * @param importName - The import's key under `imports`
   * @param differences - Each option the write gives otherwise, with both values
   */
  constructor(importName: string, differences: readonly DeclarationDifference[]) {
    super(
      `courier.config declares the import "${importName}" with ${listed(differences, "declared")}, but this write asks for ${listed(differences, "requested")}. Generate it with the declared options, or change the declaration first.`,
      { code: "DECLARATION_MISMATCH", context: { importName, differences } },
    );
  }
}
