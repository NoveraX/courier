import { createRequire } from "node:module";
import { join } from "node:path";

/** A version of Next.js, by the parts that decide how its config names Turbopack's rules. */
export interface NextVersion {
  readonly major: number;
  readonly minor: number;
}

/**
 * The version of Next.js the project builds with: the `next` it resolves
 * from its root.
 *
 * @param root - The project's root
 * @returns The version; 16.0 when it cannot be read, the newest naming
 * @example
 * ```ts
 * nextVersion(process.cwd()); // { major: 15, minor: 5 }
 * ```
 */
export function nextVersion(root: string): NextVersion {
  try {
    const manifest: unknown = createRequire(join(root, "package.json"))("next/package.json");
    const version: unknown =
      typeof manifest === "object" && manifest !== null
        ? Reflect.get(manifest, "version")
        : undefined;
    const [major = Number.NaN, minor = Number.NaN] = String(version).split(".").map(Number);
    if (Number.isInteger(major) && Number.isInteger(minor)) return { major, minor };
  } catch {
    /* No next to read: the newest naming. */
  }
  return { major: 16, minor: 0 };
}
