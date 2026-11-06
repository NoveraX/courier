/** The bundlers `check:browser` measures a page's start under, each with a budget of its own. */
export type Bundler = "esbuild" | "webpack" | "vite";

/**
 * The framework matrix's targets `bundle.spec.ts` measures a page's start
 * on, by id: each a release of Next.js and a bundler, with a budget of its own.
 */
export type MeasuredTarget = "next-16" | "next-15-turbopack" | "next-16-webpack";

/** One page a scenario builds: its code, and its budget at start per bundler and per target measured, minified and gzipped, in KiB. */
export interface Scenario {
  readonly name: string;
  readonly code: string;
  readonly budget: Readonly<Record<Bundler | MeasuredTarget, readonly [number, number]>>;
}

/** Each scenario a page builds. */
export declare const SCENARIOS: readonly Scenario[];

/** The apps' own libraries: what they cost is theirs, not Courier's. */
export declare const PROVIDED: readonly string[];
