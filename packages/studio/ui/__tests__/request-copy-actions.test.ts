/**
 * The ways to take a request elsewhere that a row's menu and the
 * inspector's "⋯" menu both offer: copy it as cURL, fetch or JSON, or
 * download the JSON under the endpoint's name.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestCopyActions } from "@/inspector/request-copy-actions";
import { requestEntry } from "./request-entry-fixture";

const io = vi.hoisted(() => ({
  copy: vi.fn(async (_text: string, _label: string) => {}),
  download: vi.fn(),
}));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: io.copy }));
vi.mock("@/lib/export", () => ({ downloadFile: io.download }));

const request = requestEntry({ id: "r7", httpMethod: "POST", method: "create" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestCopyActions", () => {
  it("offers cURL, fetch, JSON and a download, in the menus' order", () => {
    expect(requestCopyActions(request).map((action) => action.label)).toEqual([
      "Copy as cURL",
      "Copy as fetch",
      "Copy as JSON",
      "Download JSON",
    ]);
  });

  it("copies the request as a shell command and as browser code", () => {
    const [curl, fetchCopy] = requestCopyActions(request);

    curl.onSelect();
    fetchCopy.onSelect();

    expect(io.copy).toHaveBeenNthCalledWith(1, expect.stringContaining("curl"), "as cURL");
    expect(io.copy).toHaveBeenNthCalledWith(2, expect.stringContaining("fetch("), "as fetch");
  });

  it("copies the request as JSON, and downloads the same JSON named for its endpoint", () => {
    const [, , json, download] = requestCopyActions(request);

    json.onSelect();
    download.onSelect();

    const copied = io.copy.mock.calls[0]?.[0];
    expect(JSON.parse(copied ?? "")).toMatchObject({ id: "r7" });
    expect(io.download).toHaveBeenCalledWith(copied, "api.users.create-r7.json");
  });
});
