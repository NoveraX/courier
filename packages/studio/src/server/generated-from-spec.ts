import { CourierError, createLogger } from "@noverax/courier";
import { SpecGenerationError } from "./spec-generation-error";

const log = createLogger("Studio");

/**
 * Generate code from a specification a request sent. An error that names
 * the status the request deserves — a value refused, a folder Studio does
 * not write to — is thrown as it is; anything else the generator throws is
 * a shape deeper than the request's validation reaches, the
 * specification's fault rather than Studio's, and is answered 400 too. Its
 * cause is logged, since a fault of the generator's own would look the same.
 *
 * @param generate - What generates, from the specification sent
 * @returns What it generated
 * @throws {SpecGenerationError} When the generator fails on the specification by itself
 * @example
 * ```ts
 * const files = generatedFromSpec(() => generateCode(spec, options, name));
 * ```
 */
export function generatedFromSpec<TGenerated>(generate: () => TGenerated): TGenerated {
  try {
    return generate();
  } catch (error) {
    if (error instanceof CourierError) throw error;
    log.warn("Studio could not generate code from a specification a request sent", error);
    throw new SpecGenerationError(error);
  }
}
