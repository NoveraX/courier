import type { SegmentedOption } from "@/design/segmented";
import type { GenerateOptions } from "@/features/apis/types";

/** An option of the Configure step that is on or off. */
export type Flag = "generateTypes" | "generateSchemas" | "addAuthMiddleware" | "includeComments";

/** The validation libraries the generated schemas can be written with. */
export const VALIDATION: readonly SegmentedOption<GenerateOptions["validation"]>[] = [
  { value: "zod", label: "Zod" },
  { value: "valibot", label: "Valibot" },
  { value: "arktype", label: "ArkType" },
  { value: "none", label: "None" },
];

/** How the endpoints split into files. */
export const GROUP_BY: readonly SegmentedOption<GenerateOptions["groupBy"]>[] = [
  { value: "tag", label: "Tag" },
  { value: "path", label: "Path" },
  { value: "single", label: "Single file" },
];

/** The callers the import gets. */
export const CLIENT: readonly SegmentedOption<GenerateOptions["generateClient"]>[] = [
  { value: "direct", label: "Direct" },
  { value: "proxy", label: "Proxy" },
  { value: "both", label: "Both" },
  { value: "none", label: "None" },
];

/** The options that are on or off, with what each adds. */
export const FLAGS: readonly { key: Flag; label: string; sub: string }[] = [
  {
    key: "generateTypes",
    label: "Generate types",
    sub: "TypeScript types for every request and response",
  },
  {
    key: "generateSchemas",
    label: "Generate schemas",
    sub: "runtime schemas with the validation library",
  },
  {
    key: "addAuthMiddleware",
    label: "Auth middleware",
    sub: "a middleware that adds the spec's credentials",
  },
  { key: "includeComments", label: "Include comments", sub: "the spec's descriptions as JSDoc" },
];

/**
 * The change to the options that turning one of them on or off makes.
 *
 * @param key - The option
 * @param on - Whether it is turned on
 * @returns The patch to the options
 * @example
 * ```ts
 * flagPatch("generateTypes", false); // → { generateTypes: false }
 * ```
 */
export function flagPatch(key: Flag, on: boolean): Partial<GenerateOptions> {
  const patch: Partial<GenerateOptions> = {};
  patch[key] = on;
  return patch;
}
