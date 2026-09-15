import type { ResolvedOptions, StudioPluginOptions } from "./types";

export function resolveOptions(
  framework: string,
  studioUrl: string,
  options: StudioPluginOptions = {},
): ResolvedOptions {
  return {
    enabled: options.enabled ?? process.env.NODE_ENV !== "production",
    framework,
    studioUrl,
  };
}
