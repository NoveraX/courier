import type { ResolvedOptions, StudioPluginOptions } from "./types";

/** Whether a plugin should inject: as asked, or everywhere but production. */
export function isInjectionEnabled(options: StudioPluginOptions = {}): boolean {
  return options.enabled ?? process.env.NODE_ENV !== "production";
}

export function resolveOptions(
  framework: string,
  studioUrl: string,
  options: StudioPluginOptions = {},
): ResolvedOptions {
  return {
    enabled: isInjectionEnabled(options),
    framework,
    studioUrl,
  };
}
