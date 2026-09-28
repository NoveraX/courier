/** A parsed piece of a regular expression */
export type PatternNode =
  | { kind: "text"; text: string }
  /** One character out of `chars` */
  | { kind: "set"; chars: string[] }
  /** One of several sequences (`a|b`, and every group) */
  | { kind: "alt"; branches: PatternNode[][] }
  | { kind: "repeat"; node: PatternNode; min: number; max: number };

/** Read position in a pattern's source */
export interface Cursor {
  source: string;
  pos: number;
}
