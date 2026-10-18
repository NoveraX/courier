import { InvalidSpecError } from "../../parser/invalid-spec-error";
import { jsLiteral } from "../literals";

/* A key that reads as a field of the path as it is. */
const PLAIN_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

type Step =
  | { readonly kind: "field"; readonly name: string }
  | { readonly kind: "index"; readonly at: number }
  | { readonly kind: "key"; readonly key: string };

/**
 * Where a value stands in a specification, as a link back to the one it
 * is in. The path is written out only for a value refused, so a
 * specification nested deep costs a link at each level rather than a path
 * as long as its depth.
 *
 * @example
 * ```ts
 * SpecPath.root().field("schemas").key("Pet").field("refName").toString(); // "schemas.Pet.refName"
 * ```
 */
export class SpecPath {
  private readonly up: SpecPath | null;
  private readonly step: Step | null;

  private constructor(up: SpecPath | null, step: Step | null) {
    this.up = up;
    this.step = step;
  }

  /** The specification itself, which no field names. */
  static root(): SpecPath {
    return new SpecPath(null, null);
  }

  /** A field of this value, named as the parser names it. */
  field(name: string): SpecPath {
    return new SpecPath(this, { kind: "field", name });
  }

  /** An item of this list. */
  index(at: number): SpecPath {
    return new SpecPath(this, { kind: "index", at });
  }

  /** An entry of this object, by a key the specification chose. */
  key(key: string): SpecPath {
    return new SpecPath(this, { kind: "key", key });
  }

  /**
   * Refuse the value here.
   *
   * @param value - The value refused
   * @param reason - Why, as `InvalidSpecError` words it
   * @throws {InvalidSpecError} Always, naming this path
   */
  refuse(value: unknown, reason: string): never {
    throw new InvalidSpecError(this.toString(), value, reason);
  }

  /** The path as the message shows it: `schemas.Pet.properties["a b"].refName`. */
  toString(): string {
    const steps: string[] = [];
    for (let path: SpecPath | null = this; path?.step; path = path.up) {
      steps.push(written(path.step));
    }
    return steps.reverse().join("").replace(/^\./, "");
  }
}

/* A key the specification chose is quoted unless it reads as a field. */
function written(step: Step): string {
  if (step.kind === "field") return `.${step.name}`;
  if (step.kind === "index") return `[${step.at}]`;
  return PLAIN_KEY.test(step.key) ? `.${step.key}` : `[${jsLiteral(step.key)}]`;
}
