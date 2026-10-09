/**
 * @vitest-environment jsdom
 *
 * Delivering a webhook from Studio: the dialog opens on a delivery the
 * Timeline shows — its webhook, its route and its event — or on a new one,
 * the first webhook the attached apps define and its newest route; it
 * sends what is shown, which the app signs; and it says why it cannot send
 * — a body that is not JSON, a webhook no attached app defines, the app's
 * refusal.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast, Toaster: () => null }));

import { openWebhookSend, useWebhookSend } from "@/features/webhooks/webhook-send-store";
import { post } from "@/lib/api-client";
import { WebhookSendDialog } from "@/screens/webhooks/webhook-send-dialog";

const STRIPE = {
  name: "stripe",
  scheme: "stripe",
  routes: ["http://localhost:3000/api/stripe", "http://localhost:3000/api/webhooks/stripe"],
  apps: ["billing-app"],
};

function answer(routes: Record<string, unknown>): void {
  vi.mocked(post).mockImplementation(async (url: string) => {
    const reply = routes[url];
    if (reply instanceof Error) throw reply;
    return reply;
  });
}

async function opened(ask?: Parameters<typeof openWebhookSend>[0]) {
  render(<WebhookSendDialog />);
  await act(async () => {
    openWebhookSend(ask);
    await new Promise((done) => setTimeout(done, 0));
  });
  return within(screen.getByRole("dialog"));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useWebhookSend.setState({ ask: null });
});

describe("delivering a webhook from Studio", () => {
  it("sends the delivery shown — as it came, or changed — and closes once the app took it", async () => {
    answer({
      "/api/webhooks/list": { webhooks: [STRIPE] },
      "/api/webhooks/deliver": { status: 204 },
    });
    const dialog = await opened({
      webhook: "stripe",
      to: "http://localhost:3000/api/webhooks/stripe",
      body: { id: "evt_1", type: "invoice.paid" },
    });

    expect(dialog.getByText("stripe signature · defined by billing-app")).toBeTruthy();
    fireEvent.change(dialog.getByLabelText("Event"), {
      target: { value: '{ "id": "evt_1", "type": "invoice.payment_failed" }' },
    });
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Deliver" }));
    });

    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/webhooks/deliver", {
      webhook: "stripe",
      to: "http://localhost:3000/api/webhooks/stripe",
      body: { id: "evt_1", type: "invoice.payment_failed" },
    });
    expect(toast.success).toHaveBeenCalledWith("Delivered stripe: the app answered 204");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts a new delivery on the first webhook the apps define, at its newest route", async () => {
    answer({ "/api/webhooks/list": { webhooks: [STRIPE] } });

    const dialog = await opened();

    expect((dialog.getByLabelText("Route") as HTMLInputElement).value).toBe(
      "http://localhost:3000/api/webhooks/stripe",
    );
    expect((dialog.getByLabelText("Event") as HTMLTextAreaElement).value).toBe("{}");
  });

  it("does not send a body that is not JSON, nor a webhook no attached app defines", async () => {
    answer({ "/api/webhooks/list": { webhooks: [STRIPE] } });
    const dialog = await opened({
      webhook: "stripe",
      to: "http://localhost:3000/api/webhooks/stripe",
      body: {},
    });
    const deliver = () => dialog.getByRole("button", { name: "Deliver" }) as HTMLButtonElement;

    fireEvent.change(dialog.getByLabelText("Event"), { target: { value: "{ id: 1 }" } });
    expect(dialog.getByText(/^Not JSON:/)).toBeTruthy();
    expect(deliver().disabled).toBe(true);

    cleanup();
    answer({ "/api/webhooks/list": { webhooks: [] } });
    const gone = await opened({ webhook: "github", to: "http://localhost:3000/gh", body: {} });
    expect(gone.getByRole("status").textContent).toMatch(
      /^No app attached to Studio defines the github webhook now\./,
    );
    expect((gone.getByRole("button", { name: "Deliver" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("shows why the app did not deliver it, and stays open", async () => {
    answer({
      "/api/webhooks/list": { webhooks: [STRIPE] },
      "/api/webhooks/deliver": new Error(
        "https://hooks.example is neither on this machine nor where the stripe webhook's deliveries came to.",
      ),
    });
    const dialog = await opened({ webhook: "stripe", to: "https://hooks.example", body: {} });

    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Deliver" }));
    });

    expect(dialog.getByRole("alert").textContent).toMatch(/is neither on this machine/);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
