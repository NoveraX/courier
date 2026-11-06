/** The bundlers a page's start is measured under, each with a budget of its own. */
export type Bundler = "esbuild" | "webpack" | "vite" | "turbopack";

/** One page a scenario builds: its code, and its budget at start per bundler, minified and gzipped, in KiB. */
export interface Scenario {
  readonly name: string;
  readonly code: string;
  readonly budget: Readonly<Record<Bundler, readonly [number, number]>>;
}

/** Each scenario a page builds. */
export declare const SCENARIOS: readonly Scenario[];

/** The apps' own libraries: what they cost is theirs, not Courier's. */
export declare const PROVIDED: readonly string[];
