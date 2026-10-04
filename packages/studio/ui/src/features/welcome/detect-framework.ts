/** The framework a project's packages point to, and the packages that tell it. */
export interface DetectedFramework {
  /** The id of the framework in `FRAMEWORKS`. */
  id: string;
  /** The packages found, as the setup names them: `vite · react`. */
  label: string;
}

/* The packages that tell each framework, the most specific first: a Next.js
   project depends on react too, a Nuxt one on vue. */
const SIGNALS: ReadonlyArray<readonly [id: string, packages: readonly string[]]> = [
  ["nextjs", ["next"]],
  ["nuxt", ["nuxt"]],
  ["sveltekit", ["@sveltejs/kit"]],
  ["remix", ["@remix-run/dev", "@remix-run/react", "@react-router/dev"]],
  ["astro", ["astro"]],
  ["angular", ["@angular/core"]],
  ["solid", ["@solidjs/start"]],
  ["vue", ["vue"]],
  ["react", ["react"]],
];

/**
 * The framework a project is built with, as its dependencies tell: the
 * most specific one whose package it depends on, with Vite named before it
 * when the project builds with it.
 *
 * @param dependencies - The packages the project depends on, by name
 * @returns The framework, or `null` when none of them tells one
 * @example
 * ```ts
 * detectFramework(["react", "react-dom", "vite"]); // { id: "react", label: "vite · react" }
 * ```
 */
export function detectFramework(dependencies: readonly string[]): DetectedFramework | null {
  const present = new Set(dependencies);
  for (const [id, packages] of SIGNALS) {
    const found = packages.find((name) => present.has(name));
    if (found === undefined) continue;
    return { id, label: present.has("vite") ? `vite · ${found}` : found };
  }
  return null;
}
