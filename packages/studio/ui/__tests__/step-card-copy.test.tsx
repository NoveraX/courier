/**
 * @vitest-environment jsdom
 */
/**
 * A welcome step's button copies the step's snippet and moves the
 * walkthrough on, on a page without the clipboard API too — an http page
 * opened from another address on the network — where the snippet is copied
 * through a selection.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Terminal } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/shared/code-block", () => ({ CodeBlock: () => null }));

import type { SetupStep } from "../src/views/welcome/frameworks-types";

import { StepCard } from "../src/views/welcome/step-card";

const STEP: SetupStep = {
  id: "install",
  title: "Install Courier",
  description: "Add the package to the project.",
  icon: Terminal,
  actionLabel: "Copy install command",
  code: "npm install @noverax/courier",
};

let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const fn of Object.values(toast)) fn.mockClear();
  execCommand = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "execCommand");
});

describe("a welcome step's copy button", () => {
  it("copies the snippet through a selection and moves on, on a page without the clipboard API", async () => {
    expect(navigator.clipboard).toBeUndefined();
    const onAction = vi.fn();
    render(<StepCard step={STEP} index={0} isCompleted={false} isActive onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy install command" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(toast.error).not.toHaveBeenCalled();
  });
});
