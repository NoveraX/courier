import { RUNTIME_SPECIFIER } from "./constants";
import { loadStudioUrl } from "./load-studio-url";
import { isInjectionEnabled } from "./options";
import { generateConnectSnippet } from "./snippet";
import type { StudioPluginOptions } from "./types";

/** What a build plugin asks {@link resolveSnippet} for. */
export interface SnippetRequest {
  /** The framework the snippet is for; it names the runtime. */
  framework: string;
  /** The plugin's options. */
  options?: StudioPluginOptions;
  /** Whether the bundler builds for development; see {@link isInjectionEnabled}. */
  development: boolean;
  /** The specifier the snippet imports the runtime from; see {@link generateConnectSnippet}. */
  runtime?: string;
}

/**
 * One-shot snippet resolver shared by every build plugin.
 *
 * Every plugin needs the same steps before injecting: decide whether to
 * inject, read the Studio URL from `courier.config.ts`, and render the
 * connect snippet. This helper collapses them so each bundler adapter only
 * owns its injection mechanism, not the resolution logic.
 *
 * Returns `null` when injection is disabled — a production build by default,
 * or the caller passed `enabled: false` — and then reads no config at all.
 *
 * @param request - The framework, the plugin's options and the build's mode.
 * @returns The snippet, or `null` when nothing is injected
 * @example
 * ```ts
 * const snippet = await resolveSnippet({ framework: "vite", development: true });
 * ```
 */
export async function resolveSnippet({
  framework,
  options,
  development,
  runtime = RUNTIME_SPECIFIER,
}: SnippetRequest): Promise<string | null> {
  if (!isInjectionEnabled(options, development)) return null;
  const studioUrl = await loadStudioUrl();
  return generateConnectSnippet({ framework, studioUrl }, runtime);
}
