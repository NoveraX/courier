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
  title: "Verify connection",
  description: "Start your dev server — this step completes automatically when a session connects.",
  icon: Zap,
  actionLabel: "Waiting for connection…",
  autoComplete: true,
};

export const EXPLORE_STEP: SetupStep = {
  id: "explore",
  title: "Start exploring",
  description: "You're all set! Dive into Timeline, Playground, Audit and more.",
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
    title: "Install packages",
    description: withRuntime
      ? "Add Studio as a dev dependency, and the runtime your server imports as a dependency."
      : "Add the Studio package to your project.",
    icon: Package,
    actionLabel: "Copy command",
    code: withRuntime ? `npm install ${RUNTIME_PACKAGE}\n${devCommand}` : devCommand,
    lang: "bash",
  };
}
