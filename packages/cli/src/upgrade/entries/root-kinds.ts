import type { PieceRoots } from "./framework-roots";

/** A root of a page's alone. */
export const PAGE: PieceRoots = { page: true, server: false, split: false };
/** A root of the server's alone. */
export const SERVER: PieceRoots = { page: false, server: true, split: false };
/** A module the framework splits between a page and the server. */
export const SPLIT: PieceRoots = { page: false, server: false, split: true };
/** A root of both. */
export const BOTH: PieceRoots = { page: true, server: true, split: false };
/** No root: a module whose side its imports tell. */
export const NONE: PieceRoots = { page: false, server: false, split: false };
