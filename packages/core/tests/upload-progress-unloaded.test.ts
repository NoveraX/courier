/**
 * Progress betters an upload and never decides it. Where the code that
 * reports it does not load — a deployment took its chunk away, a policy
 * kept it out — an upload goes as any body does, said once, and no retry
 * runs for the missing code. A React Native form naming a file on the
 * device goes no other way: it is refused once, saying why.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineMiddleware } from "../src/middleware";
import { isUnrepeatable } from "../src/utils/unrepeatable";

vi.mock("../src/utils/upload-progress", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

const { endpoint } = courier();
let attempts = 0;
/* Inside the endpoint's retry policy: counts each attempt it makes. */
const counted = defineMiddleware("counted", "wrap", async (_ctx, next) => {
  attempts += 1;
  return next();
});

function api() {
  return defineApi({
    name: "files",
    baseURL: "https://api.example.com",
    endpoints: {
      upload: endpoint
        .post("files")
        .variables<FormData>()
        .use(counted)
        .retry({ limit: 2, delay: 1, backoff: "fixed", retryOn: ["network"], mutations: true }),
    },
  });
}

/** FormData as Expo patches it: it lists its entries, a device file among them as appended. */
class ExpoFormData {
  readonly parts: Array<[string, unknown]> = [];
  append(name: string, value: unknown): void {
    this.parts.push([name, value]);
  }
  entries(): IterableIterator<[string, unknown]> {
    return this.parts[Symbol.iterator]();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  attempts = 0;
});

describe("an upload whose progress reporting did not load", () => {
  it("goes as any body does, said once for two uploads, and is sent once each", async () => {
    const sent = vi.fn(async () => Response.json({ stored: true }));
    vi.stubGlobal("fetch", sent);
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const form = () => {
      const data = new FormData();
      data.append("note", new Blob(["hello"], { type: "text/plain" }), "note.txt");
      return data;
    };
    const caller = createCaller(api());

    await caller.upload.with({ onUploadProgress: () => undefined })(form());
    await caller.upload.with({ onUploadProgress: () => undefined })(form());

    expect(sent).toHaveBeenCalledTimes(2);
    expect(attempts).toBe(2);
    const said = warned.mock.calls.filter((args) =>
      args.join(" ").includes("upload progress did not load"),
    );
    expect(said).toHaveLength(1);
  });

  it("refuses a React Native form naming a file on the device, once", async () => {
    const sent = vi.fn();
    vi.stubGlobal("navigator", { product: "ReactNative" });
    vi.stubGlobal("FormData", ExpoFormData);
    vi.stubGlobal("fetch", sent);
    const form = new ExpoFormData();
    form.append("photo", { uri: "file:///photo.jpg", name: "photo.jpg", type: "image/jpeg" });

    const refused = await createCaller(api())
      .upload(form as unknown as FormData)
      .catch((error: unknown) => error);

    expect(refused).toMatchObject({ code: "MODULE_NOT_LOADED" });
    expect(String(refused)).toContain("the code that sends a device's file did not load");
    expect(isUnrepeatable(refused)).toBe(true);
    expect(attempts).toBe(1);
    expect(sent).not.toHaveBeenCalled();
  });
});
