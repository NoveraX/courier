import { CourierError } from "@noverax/courier";

/* Past these, a refused value and the path to it are shown cut: a
   specification sent to Studio may make either any length. */
const SHOWN_VALUE = 40;
const SHOWN_PATH = 160;

/**
 * A specification Studio will not generate from: a value it would write
 * into the code as it stands — a name, a type, a method, a bound, a flag, a
 * pattern — that is not of a kind that can only be what it says, or a node
 * on the way to one that is not what it should be. Answered 400.
 *
 * @example
 * ```ts
 * throw new InvalidSpecError("schemas", "Pet; run()", "a name the code is written with is an identifier");
 * ```
 */
export class InvalidSpecError extends CourierError<"INVALID_SPEC"> {
  /** The status a route answers with. */
  readonly httpStatus = 400;
  /** Where in the specification the value was refused, as a path of its fields. */
  readonly field: string;
  /** What was refused and why, as the message words it after "The specification's". */
  readonly refusal: string;

  /**
   * @param field - Where in the specification the value is
   * @param value - The value: a string shown cut past 40 characters, a list or an object by its kind
   * @param reason - Why, completing "`<field>` <value> is refused: "
   */
  constructor(field: string, value: unknown, reason: string) {
    const path = cutMiddle(field);
    const shown = shownValue(value);
    const refusal = `${path} ${shown} is refused: ${reason}`;
    super(`The specification's ${refusal}.`, {
      code: "INVALID_SPEC",
      context: { field: path, value: shown },
    });
    this.field = field;
    this.refusal = refusal;
  }
}

/* A value that is no primitive is told by its kind and never turned into
   text: one sent to Studio may refuse that, or nest past the stack. */
function shownValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value.length > SHOWN_VALUE ? `${value.slice(0, SHOWN_VALUE)}…` : value);
  }
  if (Array.isArray(value)) return "[…]";
  if (typeof value === "object" && value !== null) return "{…}";
  if (typeof value === "function") return "a function";
  return String(value);
}

/* The start says which schema or endpoint, the end which field. */
function cutMiddle(path: string): string {
  if (path.length <= SHOWN_PATH) return path;
  const half = SHOWN_PATH / 2;
  return `${path.slice(0, half)}…${path.slice(-half)}`;
}
