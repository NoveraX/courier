/**
 * Shared building blocks reused by every framework configuration.
 *
 * Lets per-framework files (next, nuxt, react, etc.) reference common
 * verify/explore steps instead of duplicating them.
 */

import { Compass, Package, Zap } from "lucide-react";

import type { SetupStep } from "../frameworks-types";

export const VERIFY_STEP: SetupStep = {
  id: "connect",
  title: "Start your dev server",
  description: "This step completes on its own once a runtime connects.",
  icon: Zap,
  actionLabel: "Waiting for connection…",
  autoComplete: true,
};

export const EXPLORE_STEP: SetupStep = {
  id: "explore",
  title: "Open the Timeline",
  description: "Inspect, replay and audit what Studio captured.",
  icon: Compass,
  actionLabel: "Go to Timeline",
};

const STUDIO_PACKAGE = "@noverax/courier-studio";
const RUNTIME_PACKAGE = "@noverax/courier-studio-core";

/**
 * The step that installs Studio.
 *
 * Studio is a development tool, so it is a dev dependency. The runtime a
 * server imports `attachRuntime()` from is a dependency: a production install
 * leaves dev dependencies out, and a server whose code imports the runtime —
 * or runs it in production, where it registers the config's sources — does
 * not start without it.
 *
 * @param options - `withRuntime` for a guide whose server connects to Studio too.
 * @returns The install step.
 * @example
 * ```ts
 * installStep({ withRuntime: true });
 * ```
 */
export function installStep({ withRuntime = false }: { withRuntime?: boolean } = {}): SetupStep {
  const devCommand = `npm install -D ${STUDIO_PACKAGE}`;
  return {
    id: "install",
    title: withRuntime ? "Install the packages" : "Install the package",
    description: withRuntime
      ? "Add Studio as a dev dependency, and the runtime your server imports as a dependency."
      : "Add Studio as a dev dependency.",
    icon: Package,
    actionLabel: "Copy command",
    code: withRuntime ? `npm install ${RUNTIME_PACKAGE}\n${devCommand}` : devCommand,
    lang: "bash",
  };
}
