/**
 * @vitest-environment jsdom
 */
/**
 * The Store view's changes to a mock's store are confirmed by the mock: the
 * toast says a change was made only once the mock answers that it made it,
 * and says why when the mock refused or did not answer.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type Ack = (error: Error | null, reply?: unknown) => void;

const sent: Array<{ event: string; command: Record<string, unknown>; ack: Ack }> = [];
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/socket", () => ({
  getSocket: () => ({
    timeout: () => ({
      emit: (event: string, command: Record<string, unknown>, ack: Ack) => {
        sent.push({ event, command, ack });
      },
    }),
  }),
}));

const { useStoreCrud } = await import("@/mocks/use-store-crud");

function crud() {
  return renderHook(() => useStoreCrud()).result.current;
}

/** Let the awaited answer reach the toast. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  sent.length = 0;
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("a change to a mock's store", () => {
  it("is confirmed only once the mock answers that it made it", async () => {
    crud().createRecord("apiMock", "users", { name: "Ada" });
    await settle();

    expect(sent[0]?.command).toEqual({
      action: "mock:store:create",
      serverId: "apiMock",
      collection: "users",
      record: { name: "Ada" },
    });
    expect(toast.success).not.toHaveBeenCalled();

    sent[0]?.ack(null, { ok: true });
    await settle();

    expect(toast.success).toHaveBeenCalledWith("Created a record in users");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says why the mock refused it", async () => {
    crud().updateRecord("apiMock", "users", "9", { name: "Grace" });
    sent[0]?.ack(null, { ok: false, error: 'users has no record with id "9"' });
    await settle();

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Could not update #9", {
      description: 'users has no record with id "9"',
    });
  });

  it("counts a mock that does not answer as one that did not make it", async () => {
    crud().seedCollection("apiMock", "users", 5);
    sent[0]?.ack(new Error("operation has timed out"));
    await settle();

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Could not seed users", {
      description: "The mock did not answer.",
    });
  });

  it("reads an answer that is not a reply as no answer", async () => {
    crud().clearCollection("apiMock", "users");
    sent[0]?.ack(null, "ok");
    await settle();

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Could not clear users", {
      description: "The mock did not answer.",
    });
  });
});

describe("deleting the selected records", () => {
  it("says once that all of them are gone", async () => {
    crud().deleteRecords("apiMock", "users", ["1", "2", "3"]);
    for (const { ack } of sent) ack(null, { ok: true });
    await settle();

    expect(sent.map(({ command }) => command.id)).toEqual(["1", "2", "3"]);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Deleted 3 records");
  });

  it("counts the ones the mock could not delete", async () => {
    crud().deleteRecords("apiMock", "users", ["1", "2"]);
    sent[0]?.ack(null, { ok: true });
    sent[1]?.ack(null, { ok: false, error: 'users has no record with id "2"' });
    await settle();

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Could not delete 1 of 2 records", {
      description: 'users has no record with id "2"',
    });
  });
});
