/**
 * @vitest-environment jsdom
 *
 * Generate mocks, the new shell's dialog over the mock wizard: sources
 * picked, each mock configured, Studio's exact change reviewed and applied
 * once it has been on screen a moment, the mocks then awaited — and Studio's
 * other answers: a change to add by hand, one put back, a config that does
 * not load. A click outside or Esc leaves mocks not yet added alone.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScannedSource } from "@/features/apis/types";
import type { SourceAvailability } from "../src/features/mocks/wizard/source-availability";
import type { ManualOutcome, ReadyOutcome } from "../src/features/mocks/wizard/wire-types";
import type { DeclareClient } from "../src/mocks/wizard/declare-client";
import type { MockWizardHandle } from "../src/mocks/wizard/use-mock-wizard";
import type { WizardSession } from "../src/mocks/wizard/wizard-session";
import { createWizardSession } from "../src/mocks/wizard/wizard-session";
import { GenerateMocksDialog } from "../src/screens/mocks/wizard/generate-mocks-dialog";

const SOURCES: ScannedSource[] = [
  {
    name: "shop",
    baseURL: "https://shop.example",
    filePath: "src/shop.ts",
    isImported: false,
    hasClient: true,
    groups: [
      {
        name: "users",
        prefix: "/users",
        filePath: "src/shop.ts",
        endpoints: [
          {
            name: "list",
            analysis: {
              hasResponseType: true,
              hasVariablesType: false,
              hasValidation: false,
              httpMethod: "get",
              path: "",
              type: "query",
            },
          },
        ],
      },
    ],
  },
];

const READY: ReadyOutcome = {
  status: "ready",
  target: "courier.mocks.ts",
  creates: true,
  baseHash: null,
  planDigest: "b".repeat(64),
  hunks: [
    { lines: [{ kind: "add", text: "export default defineMocks({", oldLine: null, newLine: 1 }] },
  ],
  warnings: ["Port 7001 is taken; Studio picks the next free one"],
};

const MANUAL: ManualOutcome = {
  status: "manual",
  target: "courier.mocks.ts",
  creates: false,
  reasons: [
    {
      code: "MOCKS_NOT_LITERAL",
      source: null,
      message: "The default export is computed, so Studio cannot edit it.",
    },
  ],
  snippet: "shop: defineMockServer({ source: shop }),",
  retryable: false,
};

function Wizard({
  session,
  close,
  availability = { kind: "sources", blocked: null },
}: {
  session: WizardSession;
  close: () => void;
  availability?: SourceAvailability;
}): React.ReactElement {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const wizard: MockWizardHandle = {
    open: true,
    state,
    session,
    connected: true,
    availability,
    sources: SOURCES,
    errors: new Map(),
    close,
    toggleSource: (source) => session.dispatch({ type: "toggleSource", source, declaredKeys: [] }),
  };
  return <GenerateMocksDialog wizard={wizard} />;
}

function wizardSession(client: Partial<DeclareClient> = {}): WizardSession {
  return createWizardSession({
    client: { preview: vi.fn(), apply: vi.fn(), ...client },
    log: { error: vi.fn() },
  });
}

/* Radix starts listening for clicks outside the dialog on the tick after it opens. */
async function afterOpening(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

async function clickOutside(): Promise<void> {
  const overlay =
    document.querySelector('[data-state="open"]:not([role="dialog"])') ?? document.body;
  fireEvent.pointerDown(overlay);
  fireEvent.mouseDown(overlay);
  fireEvent.pointerUp(overlay);
  fireEvent.mouseUp(overlay);
  fireEvent.click(overlay);
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("generating a mock", () => {
  it("picks a source, configures its mock, and applies Studio's change once it has been seen", async () => {
    vi.useFakeTimers();
    const preview = vi.fn<DeclareClient["preview"]>().mockResolvedValue(READY);
    const apply = vi.fn<DeclareClient["apply"]>().mockResolvedValue({
      status: "applied",
      target: "courier.mocks.ts",
      keys: ["shop"],
      warnings: [],
    });
    const session = wizardSession({ preview, apply });
    render(<Wizard session={session} close={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: /shop/ }));
    expect(screen.getByText("1 source selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      within(screen.getByRole("region", { name: "Mock of shop" })).getByLabelText("Mock key"),
    ).toHaveProperty("value", "shop");
    fireEvent.click(screen.getByRole("button", { name: "Review change" }));
    await act(() => vi.advanceTimersByTimeAsync(200));

    expect(
      screen.getByRole("region", { name: "Change to courier.mocks.ts" }).textContent,
    ).toContain("export default defineMocks({");
    expect(screen.getByText("+1 −0 in courier.mocks.ts")).toBeTruthy();
    expect(screen.getByText("Port 7001 is taken; Studio picks the next free one")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create courier.mocks.ts" })).toHaveProperty(
      "disabled",
      true,
    );
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    fireEvent.click(screen.getByRole("button", { name: "Create courier.mocks.ts" }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(apply).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Added to courier.mocks.ts", { selector: "h3" })).toBeTruthy();
    expect(screen.getByText("Waiting for Studio to list it")).toBeTruthy();
  });

  it("asks Studio for a mock that answers the endpoints picked, with recordings", async () => {
    const preview = vi.fn<DeclareClient["preview"]>().mockResolvedValue(READY);
    const session = wizardSession({ preview });
    session.dispatch({ type: "toggleSource", source: "shop", declaredKeys: [] });
    session.dispatch({ type: "goTo", step: "configure" });
    render(<Wizard session={session} close={vi.fn()} />);
    const panel = within(screen.getByRole("region", { name: "Mock of shop" }));

    fireEvent.click(panel.getByRole("button", { name: "Some endpoints" }));
    expect(panel.getByText(/The rest go to https:\/\/shop\.example/)).toBeTruthy();
    fireEvent.click(panel.getByRole("checkbox", { name: "Answer users.list" }));
    fireEvent.click(panel.getByRole("button", { name: "Recorded" }));
    expect(panel.getByText(/saved to \.\/fixtures\/shop\.har/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Review change" })));

    expect(preview).toHaveBeenCalledWith([
      expect.objectContaining({
        key: "shop",
        endpoints: ["users.list"],
        fixtures: "./fixtures/shop.har",
      }),
    ]);
  });

  it("gives the code to add by hand when Studio cannot write the change", async () => {
    const session = wizardSession({
      preview: vi.fn<DeclareClient["preview"]>().mockResolvedValue(MANUAL),
    });
    session.dispatch({ type: "toggleSource", source: "shop", declaredKeys: [] });
    session.dispatch({ type: "goTo", step: "configure" });
    render(<Wizard session={session} close={vi.fn()} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Review change" })));

    expect(
      screen.getByRole("heading", { name: "Add this to courier.mocks.ts yourself" }),
    ).toBeTruthy();
    expect(
      screen.getByText("The default export is computed, so Studio cannot edit it."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy snippet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("shows a change Studio put back, with the code to add by hand, and checks again", async () => {
    vi.useFakeTimers();
    const preview = vi.fn<DeclareClient["preview"]>().mockResolvedValue(READY);
    const apply = vi.fn<DeclareClient["apply"]>().mockResolvedValue({
      status: "rolledBack",
      target: "courier.mocks.ts",
      creates: true,
      reason: "SyntaxError: Unexpected token",
      snippet: "shop: defineMockServer({ source: shop }),",
    });
    const session = wizardSession({ preview, apply });
    session.dispatch({ type: "toggleSource", source: "shop", declaredKeys: [] });
    session.dispatch({ type: "goTo", step: "configure" });
    render(<Wizard session={session} close={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Review change" }));
    await act(() => vi.advanceTimersByTimeAsync(1_500));

    fireEvent.click(screen.getByRole("button", { name: "Create courier.mocks.ts" }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByRole("alert").textContent).toContain("so it removed courier.mocks.ts");
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });

  it("says why there are no sources to pick", () => {
    render(
      <Wizard
        session={wizardSession()}
        close={vi.fn()}
        availability={{
          kind: "failed",
          blocked: "courier.config.ts does not load",
          configFile: "courier.config.ts",
          message: "SyntaxError: Unexpected token",
        }}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("courier.config.ts does not load");
  });
});

describe("a click outside or Esc", () => {
  it("closes the dialog while it holds no mocks to add", async () => {
    const close = vi.fn();
    render(<Wizard session={wizardSession()} close={close} />);
    await afterOpening();

    await clickOutside();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(close).toHaveBeenCalledTimes(2);
  });

  it("leaves the dialog and its mocks alone while it holds mocks not yet added", async () => {
    const session = wizardSession();
    session.dispatch({ type: "toggleSource", source: "shop", declaredKeys: [] });
    const close = vi.fn();
    render(<Wizard session={session} close={close} />);
    await afterOpening();

    await clickOutside();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(close).not.toHaveBeenCalled();
    expect(session.getState().drafts).toHaveLength(1);
  });
});
