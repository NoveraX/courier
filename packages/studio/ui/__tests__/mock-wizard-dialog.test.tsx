/**
 * @vitest-environment jsdom
 */
/**
 * The mock wizard's dialog as a user clicks it. The plan appears within
 * milliseconds of the click on "Review change", and its apply button sits
 * about where that button was: the second click of a double click must not
 * write a change nobody has seen, nor close the dialog and lose the drafts
 * when it lands outside it. Escape leaves drafts alone the same way.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadyOutcome } from "../src/features/mocks/wizard/wire-types";
import type { DeclareClient } from "../src/mocks/wizard/declare-client";
import type { MockWizardHandle } from "../src/mocks/wizard/use-mock-wizard";
import type { WizardSession } from "../src/mocks/wizard/wizard-session";
import { createWizardSession } from "../src/mocks/wizard/wizard-session";
import { MockWizard } from "../src/views/mocks/wizard/mock-wizard";

const READY: ReadyOutcome = {
  status: "ready",
  target: "courier.mocks.ts",
  creates: true,
  baseHash: null,
  planDigest: "b".repeat(64),
  hunks: [
    { lines: [{ kind: "add", text: "export default defineMocks({", oldLine: null, newLine: 1 }] },
  ],
  warnings: [],
};

function Wizard({
  session,
  close,
}: {
  session: WizardSession;
  close: () => void;
}): React.ReactElement {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const wizard: MockWizardHandle = {
    open: true,
    state,
    session,
    connected: true,
    availability: { kind: "sources", blocked: null },
    sources: [],
    errors: new Map(),
    close,
    toggleSource: (source) => session.dispatch({ type: "toggleSource", source, declaredKeys: [] }),
  };
  return <MockWizard wizard={wizard} />;
}

function wizardSession(client: DeclareClient): WizardSession {
  return createWizardSession({ client, log: { error: vi.fn() } });
}

/* Radix starts listening for clicks outside the dialog on the tick after it opens. */
async function afterOpening(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

/* Radix dismisses on the click that follows a left button's press outside, and the tick after it. */
async function clickOutside(): Promise<void> {
  const overlay = document.querySelector("[data-slot=dialog-overlay]");
  expect(overlay).not.toBeNull();
  const target = overlay ?? document.body;
  fireEvent.pointerDown(target);
  fireEvent.mouseDown(target);
  fireEvent.pointerUp(target);
  fireEvent.mouseUp(target);
  fireEvent.click(target);
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a double click on Review change", () => {
  it("does not apply the plan with its second click, and a click once the plan has been shown does", async () => {
    vi.useFakeTimers();
    const preview = vi.fn<DeclareClient["preview"]>().mockResolvedValue(READY);
    const apply = vi.fn<DeclareClient["apply"]>().mockResolvedValue({
      status: "applied",
      target: "courier.mocks.ts",
      keys: ["api"],
      warnings: [],
    });
    const session = wizardSession({ preview, apply });
    session.dispatch({ type: "toggleSource", source: "api", declaredKeys: [] });
    session.dispatch({ type: "goTo", step: "configure" });
    render(<Wizard session={session} close={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Review change" }));
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(preview).toHaveBeenCalledTimes(1);
    const applyButton = screen.getByRole("button", { name: "Create courier.mocks.ts" });
    expect(applyButton).toHaveProperty("disabled", true);
    fireEvent.click(applyButton);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(apply).not.toHaveBeenCalled();
    expect(session.getState().step).toBe("review");

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByRole("button", { name: "Create courier.mocks.ts" })).toHaveProperty(
      "disabled",
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create courier.mocks.ts" }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(apply).toHaveBeenCalledTimes(1);
    expect(session.getState().step).toBe("done");
  });
});

describe("a click outside the dialog", () => {
  it("closes the dialog while it holds no drafts", async () => {
    const close = vi.fn();
    render(<Wizard session={wizardSession({ preview: vi.fn(), apply: vi.fn() })} close={close} />);
    await afterOpening();

    await clickOutside();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("leaves the dialog and its drafts alone while it holds drafts not yet added", async () => {
    const session = wizardSession({ preview: vi.fn(), apply: vi.fn() });
    session.dispatch({ type: "toggleSource", source: "api", declaredKeys: [] });
    const close = vi.fn();
    render(<Wizard session={session} close={close} />);
    await afterOpening();

    await clickOutside();
    act(() => session.dispatch({ type: "goTo", step: "configure" }));
    await clickOutside();

    expect(close).not.toHaveBeenCalled();
    expect(session.getState().drafts).toHaveLength(1);
  });
});

describe("Escape", () => {
  it("closes the dialog while it holds no drafts", async () => {
    const close = vi.fn();
    render(<Wizard session={wizardSession({ preview: vi.fn(), apply: vi.fn() })} close={close} />);
    await afterOpening();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("leaves the dialog and its drafts alone while it holds drafts not yet added", async () => {
    const session = wizardSession({ preview: vi.fn(), apply: vi.fn() });
    session.dispatch({ type: "toggleSource", source: "api", declaredKeys: [] });
    const close = vi.fn();
    render(<Wizard session={session} close={close} />);
    await afterOpening();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(close).not.toHaveBeenCalled();
    expect(session.getState().drafts).toHaveLength(1);
  });
});
