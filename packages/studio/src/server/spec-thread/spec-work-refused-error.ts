import { CourierError } from "@noverax/courier";

/** Why a job on specifications other than reading one has no result. */
export type SpecWorkRefusedCode = "CODE_NOT_GENERATED" | "SPECS_NOT_COMPARED";

/**
 * Studio could not generate code from a specification, or compare two:
 * what it was given is at fault — an output directory or a name refused,
 * a specification of a shape the generator cannot follow — and the message
 * says why, as the generator put it. Answered 400.
 *
 * @example
 * ```ts
 * throw new SpecWorkRefusedError("CODE_NOT_GENERATED", "outputDir must stay inside the project");
 * ```
 */
export class SpecWorkRefusedError extends CourierError<SpecWorkRefusedCode> {
  /** The status a route answers with. */
  readonly httpStatus = 400;

  /**
   * @param code - Which job was refused
   * @param message - Why, as the job put it
   */
  constructor(code: SpecWorkRefusedCode, message: string) {
    super(message, { code });
  }
}
