import { RUNTIME_SPECIFIER } from "./constants";
import { loadStudioUrl } from "./load-studio-url";
import { resolveOptions } from "./options";
import { generateConnectSnippet } from "./snippet";
import type { StudioPluginOptions } from "./types";

/**
 * One-shot snippet resolver shared by every build plugin.
 *
 * Every plugin needs the same three steps before injecting: load the Studio
 * URL from `courier.config.ts`, resolve plugin options, and (if enabled)
 * render the connect snippet. This helper collapses them so each bundler
 * adapter only owns its injection mechanism, not the resolution logic.
 *
 * Returns `null` when injection is disabled (production by default, or when
 * the caller explicitly passed `enabled: false`). `runtime` is what the
 * snippet imports the runtime from — see {@link generateConnectSnippet}.
 */
export async function resolveSnippet(
  framework: string,
  options?: StudioPluginOptions,
  runtime: string = RUNTIME_SPECIFIER,
): Promise<string | null> {
  const studioUrl = await loadStudioUrl();
  const resolved = resolveOptions(framework, studioUrl, options);
  if (!resolved.enabled) return null;
  return generateConnectSnippet(resolved, runtime);
}
