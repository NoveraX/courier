import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { STUDIO_DEFAULT_URL } from "@noverax/courier/config";
import { loadStudioUrl } from "./load-studio-url";
import { isInjectionEnabled } from "./options";
import type { StudioPluginOptions } from "./types";

const log = createLogger("StudioPlugin");

const CLIENT_INSTRUMENTATION = /^instrumentation-client\.[cm]?[jt]sx?$/;

/**
 * Under Turbopack a config wrapper cannot reach the browser bundle, so say how
 * to connect it — unless the app already has `instrumentation-client`, in the
 * project root or in `src/`. Without this the browser stayed silently
 * unconnected.
 *
 * @param options - The wrapper's options; nothing is said when it is disabled.
 * @param projectRoot - Where the app's files are.
 */
export function hintClientInstrumentation(
  options?: StudioPluginOptions,
  projectRoot: string = process.cwd(),
): void {
  /* `next build` sets NODE_ENV to production, which rules a build out. */
  if (!isInjectionEnabled(options, true) || hasClientInstrumentation(projectRoot)) return;
  void loadStudioUrl(projectRoot).then((url) => log.warn(hint(url)));
}

function hasClientInstrumentation(projectRoot: string): boolean {
  return [projectRoot, join(projectRoot, "src")].some(
    (dir) => existsSync(dir) && readdirSync(dir).some((name) => CLIENT_INSTRUMENTATION.test(name)),
  );
}

function hint(url: string): string {
  const lines = [
    "Turbopack runs no webpack plugins, so withCourierStudio() cannot connect",
    "the browser to Studio. Connect it from instrumentation-client.ts:",
    "",
    `  import { attachRuntime } from "@noverax/courier-studio-core/runtime";`,
    "",
    `  if (process.env.NODE_ENV === "development") {`,
    `    attachRuntime("next-browser");`,
    "  }",
  ];
  if (url === STUDIO_DEFAULT_URL) return lines.join("\n");
  return [
    ...lines,
    "",
    `Studio is configured at ${url}, so tell the browser in next.config:`,
    "",
    `  env: { COURIER_STUDIO_URL: ${JSON.stringify(url)} }`,
  ].join("\n");
}
