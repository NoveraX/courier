import { RUNTIME_SPECIFIER } from "./constants";
import { loadStudioUrl } from "./load-studio-url";
import { isInjectionEnabled, resolveOptions } from "./options";
import { generateConnectSnippet } from "./snippet";
import type { StudioPluginOptions } from "./types";

/**
 * One-shot snippet resolver shared by every build plugin.
 *
 * Every plugin needs the same steps before injecting: decide whether to
 * inject, read the Studio URL from `courier.config.ts`, and render the
 * connect snippet. This helper collapses them so each bundler adapter only
 * owns its injection mechanism, not the resolution logic.
 *
 * Returns `null` when injection is disabled (production by default, or when
 * the caller explicitly passed `enabled: false`), and then reads no config at
 * all. `runtime` is what the snippet imports the runtime from — see
 * {@link generateConnectSnippet}.
 *
 * @param framework - The framework the snippet is for
 * @param options - The plugin's options
 * @param runtime - The specifier the snippet imports the runtime from
 * @returns The snippet, or `null` when nothing is injected
 * @example
 * ```ts
 * const snippet = await resolveSnippet("vite", { enabled: true });
 * ```
 */
export async function resolveSnippet(
  framework: string,
  options?: StudioPluginOptions,
  runtime: string = RUNTIME_SPECIFIER,
): Promise<string | null> {
  if (!isInjectionEnabled(options)) return null;
  const studioUrl = await loadStudioUrl();
  return generateConnectSnippet(resolveOptions(framework, studioUrl, options), runtime);
}
