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

export function installStep(pkg: string): SetupStep {
  return {
    id: "install",
    title: "Install packages",
    description: "Add the Studio package to your project.",
    icon: Package,
    actionLabel: "Copy command",
    code: `npm install -D ${pkg}`,
    lang: "bash",
  };
}
