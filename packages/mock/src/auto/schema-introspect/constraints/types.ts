/**
 * One check read from a schema, in a shape shared by every schema library.
 */
export type ConstraintRule =
  | { kind: "min"; value: number; inclusive: boolean }
  | { kind: "max"; value: number; inclusive: boolean }
  | { kind: "integer" }
  | { kind: "multipleOf"; value: number }
  | { kind: "minLength"; value: number }
  | { kind: "maxLength"; value: number }
  | { kind: "length"; value: number }
  | { kind: "format"; format: string }
  | { kind: "pattern"; pattern: RegExp }
  | { kind: "startsWith"; value: string }
  | { kind: "endsWith"; value: string }
  | { kind: "includes"; value: string };
