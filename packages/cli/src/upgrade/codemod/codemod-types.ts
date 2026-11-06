import type { AstNode } from "./ast";

/** A file's text and tree, as a codemod reads it. */
export interface ParsedFile {
  readonly program: AstNode;
  readonly text: string;
}

/** A name on its way to a declaration of its new module: how it is written, and whether it is a type. */
export interface Pending {
  readonly spec: string;
  readonly typeOnly: boolean;
}
