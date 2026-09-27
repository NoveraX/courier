import { describe, expect, it, vi } from "vitest";

const post = vi.fn();

vi.mock("@noverax/courier", async () => {
  const actual = await vi.importActual<typeof import("@noverax/courier")>("@noverax/courier");
  return { ...actual, createFetch: () => ({ post }) };
});

const { HTTPError } = await import("@noverax/courier");
const { post: studioPost } = await import("@/lib/api-client");
const { StudioRequestError } = await import("@/lib/studio-request-error");

function httpError(data: unknown, status = 400): unknown {
  return new HTTPError({ status, headers: new Headers(), data });
}

describe("Studio API client", () => {
  it("raises the reason the server gave instead of the bare status", async () => {
    post.mockRejectedValueOnce(httpError({ error: "Blocked request to loopback address: localhost" }));

    await expect(studioPost("/api/apis/parse")).rejects.toThrow(
      "Blocked request to loopback address: localhost",
    );
  });

  it("carries Studio's code and the rest of its answer, such as a refused plan", async () => {
    const plan = { digest: "d" };
    post.mockRejectedValueOnce(httpError({ error: "Allow the steps first.", code: "NEEDS_CONFIRMATION", plan }, 409));

    const error: unknown = await studioPost("/api/apis/write").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(StudioRequestError);
    expect(error).toMatchObject({ message: "Allow the steps first.", code: "NEEDS_CONFIRMATION", data: { plan } });
  });

  it("leaves the code unset when Studio gave none", async () => {
    post.mockRejectedValueOnce(httpError({ error: "Bad request" }));

    const error: unknown = await studioPost("/api/apis/write").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(StudioRequestError);
    expect(error).toHaveProperty("code", undefined);
  });

  it("keeps the original error when the body explains nothing", async () => {
    post.mockRejectedValueOnce(httpError({ somethingElse: true }));

    await expect(studioPost("/api/apis/parse")).rejects.toThrow("HTTP 400");
  });

  it("keeps a non-HTTP failure untouched", async () => {
    post.mockRejectedValueOnce(new Error("Network request failed"));

    await expect(studioPost("/api/apis/parse")).rejects.toThrow("Network request failed");
  });

  it("returns the payload when the request succeeds", async () => {
    post.mockResolvedValueOnce({ ok: true });

    await expect(studioPost("/api/apis/parse")).resolves.toEqual({ ok: true });
  });
});
