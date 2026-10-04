/**
 * How far a framework's setup has come: a step to copy is done once copied,
 * the connect step once an app is attached, and opening the Timeline — what
 * the setup leads to — never; the first step not done is the current one,
 * and the connect step fails while Studio cannot be reached.
 */
import { describe, expect, it } from "vitest";

import { FRAMEWORKS } from "@/features/welcome/frameworks";
import { setupProgress } from "@/features/welcome/setup-progress";

const nextjs = FRAMEWORKS.find((f) => f.id === "nextjs");
if (!nextjs) throw new Error("Next.js is one of the frameworks");

describe("setupProgress", () => {
  it("names each step's kind and number, in order", () => {
    const { steps, total } = setupProgress(nextjs, new Set(), false, false);

    expect(steps.map((s) => [s.number, s.kind])).toEqual([
      [1, "install"],
      [2, "client"],
      [3, "server"],
      [4, "connect"],
      [5, "explore"],
    ]);
    expect(total).toBe(5);
  });

  it("counts a copied step done, and makes the first one left current", () => {
    const { steps, done } = setupProgress(nextjs, new Set(["install"]), false, false);

    expect(done).toBe(1);
    expect(steps.map((s) => s.done)).toEqual([true, false, false, false, false]);
    expect(steps.find((s) => s.current)?.kind).toBe("client");
  });

  it("completes the connect step once an app attaches, and never the last", () => {
    const copied = new Set(["install", "instrument-client", "instrument-server", "explore"]);

    const { steps, done } = setupProgress(nextjs, copied, true, false);

    expect(done).toBe(4);
    expect(steps.at(-1)).toMatchObject({ kind: "explore", done: false, current: true });
  });

  it("fails the connect step while Studio cannot be reached", () => {
    const { steps } = setupProgress(nextjs, new Set(), false, true);

    expect(steps.filter((s) => s.failed).map((s) => s.kind)).toEqual(["connect"]);
  });
});
