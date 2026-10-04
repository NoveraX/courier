import type { FrameworkConfig, SetupStep } from "./frameworks-types";

/** What a setup step asks of the developer. */
export type StepKind = "install" | "client" | "server" | "connect" | "explore";

/** A step as the page shows it. */
export interface StepProgress {
  step: SetupStep;
  kind: StepKind;
  /** Its place in the list, from 1. */
  number: number;
  done: boolean;
  /** The first step not done yet. */
  current: boolean;
  /** The connect step while Studio cannot be reached. */
  failed: boolean;
}

/** A framework's setup, step by step, and how far along it is. */
export interface SetupProgress {
  steps: StepProgress[];
  done: number;
  total: number;
}

const KINDS: Readonly<Record<string, StepKind>> = {
  install: "install",
  instrument: "client",
  "instrument-client": "client",
  "instrument-server": "server",
  connect: "connect",
  explore: "explore",
};

/**
 * How far a framework's setup has come: a step to copy is done once copied,
 * the connect step once an app is attached, and the last step — opening
 * the Timeline — is what the setup leads to, never done here.
 *
 * @param framework - The framework picked
 * @param copied - The steps whose command or snippet was copied
 * @param attached - Whether an app is attached to Studio
 * @param unreachable - Whether Studio itself cannot be reached
 * @returns The steps and the count done
 * @example
 * ```ts
 * setupProgress(NEXTJS, new Set(["install"]), false, false).done; // 1
 * ```
 */
export function setupProgress(
  framework: FrameworkConfig,
  copied: ReadonlySet<string>,
  attached: boolean,
  unreachable: boolean,
): SetupProgress {
  const kinds = framework.steps.map((step) => KINDS[step.id] ?? "client");
  const done = framework.steps.map((step, index) => {
    const kind = kinds[index];
    if (kind === "connect") return attached;
    return kind !== "explore" && copied.has(step.id);
  });
  const current = done.indexOf(false);
  const steps = framework.steps.map((step, index) => ({
    step,
    kind: kinds[index] ?? "client",
    number: index + 1,
    done: done[index] ?? false,
    current: index === current,
    failed: kinds[index] === "connect" && unreachable,
  }));
  return { steps, done: done.filter(Boolean).length, total: steps.length };
}
