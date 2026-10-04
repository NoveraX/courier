/**
 * @vitest-environment jsdom
 *
 * What the inspector's Response and Request tabs show of a payload — or
 * why there is none — and the Timeline's export: the saved session's when
 * one is shown, else the live requests', downloaded under a name of the
 * moment, a failure told in a toast.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestView, responseView } from "@/features/requests/payload-view";
import { exportShownRequests } from "@/features/sessions/export-requests";
import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";

const post = vi.hoisted(() => vi.fn());
const download = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiClient: { post } }));
vi.mock("@/lib/export", () => ({ downloadFile: download }));
vi.mock("sonner", () => ({ toast }));

describe("the Response tab", () => {
  it("shows the answer with how its schema check went, and the issues by path", () => {
    const r = requestEntry({
      status: "validation_error",
      data: { price: "64.00" },
      validated: { variables: "passed", response: "failed" },
      error: {
        type: "validation",
        message: "x",
        validationIssues: [{ path: "price", message: "Expected number" }],
      },
    });

    const view = responseView(r);

    expect(view.value).toEqual({ price: "64.00" });
    expect(view.chips).toEqual([{ label: "schema mismatch", tone: "warn" }]);
    expect([...view.issues]).toEqual([["price", "Expected number"]]);
  });

  it("says why there is no answer: in flight, aborted, or empty", () => {
    expect(responseView(requestEntry({ status: "pending" })).empty?.title).toBe(
      "Waiting for the response",
    );
    expect(responseView(requestEntry({ status: "aborted" })).empty?.title).toBe("No response");
    expect(responseView(requestEntry({ statusCode: 204 })).empty?.title).toBe("204 No Content");
  });

  it("shows an answer that is not JSON as text, and an error's status", () => {
    const view = responseView(
      requestEntry({ status: "error", statusCode: 502, rawResponse: "Bad gateway" }),
    );

    expect(view.text).toBe("Bad gateway");
    expect(view.chips).toEqual([{ label: "502", tone: "err" }]);
  });
});

describe("the Request tab", () => {
  it("shows the variables, marked when the input schema took or refused them", () => {
    expect(
      requestView(requestEntry({ variables: { id: 1 }, validated: { variables: "passed" } })),
    ).toMatchObject({
      value: { id: 1 },
      chips: [{ label: "validated", tone: "ok" }],
    });
    expect(requestView(requestEntry({ variables: {} })).empty?.title).toBe("No variables");
  });
});

describe("exporting the requests", () => {
  const blob = new Blob(["{}"]);
  const now = new Date(2026, 9, 5, 9, 4, 3);

  beforeEach(() => {
    post.mockReset();
    download.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    useStudioStore.setState({ requests: [requestEntry()], shownSession: null });
  });

  it("downloads the live requests as Studio exports them, unsaved", async () => {
    post.mockResolvedValue(blob);

    expect(await exportShownRequests("har", now)).toBe(true);

    expect(post).toHaveBeenCalledWith("/api/sessions/export-live", {
      json: { requests: [expect.objectContaining({ id: "r1", source: "api" })], format: "har" },
      responseType: "blob",
    });
    expect(download).toHaveBeenCalledWith(blob, "courier-requests-20261005-090403.har");
  });

  it("downloads the saved session shown, by its id", async () => {
    post.mockResolvedValue(blob);
    useStudioStore.setState({ shownSession: { id: "s1", name: "Saved" } });

    await exportShownRequests("postman", now);

    expect(post).toHaveBeenCalledWith("/api/sessions/export", {
      json: { id: "s1", format: "postman" },
      responseType: "blob",
    });
    expect(download).toHaveBeenCalledWith(blob, "session-s1.postman_collection.json");
  });

  it("says why when Studio cannot export", async () => {
    post.mockRejectedValue(new Error("Studio is offline"));

    expect(await exportShownRequests("json", now)).toBe(false);

    expect(download).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Could not export the requests: Studio is offline");
  });
});
