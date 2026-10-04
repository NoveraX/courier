import { describe, expect, it } from "vitest";
import { mergeGroupFile } from "../src/apis/merge/merge-group";
import type { FingerprintResult } from "../src/apis/merge/types";
import { previewUpdate } from "../src/apis/merge/update-flow";

const USER_EDITED = `import { courier, defineApi } from "@noverax/courier/define";

const { endpoint } = courier();

export const api = defineApi({
  baseURL: process.env.API_URL ?? "https://staging.example.com",
  proxyPath: { http: "/api/relay" },
  endpoints: {
    getAll: endpoint.get("archive").response<User[]>(),
    mine: endpoint.get("mine").response<User[]>(),
  },
});
`;

const GENERATED = `import { courier, defineApi } from "@noverax/courier/define";

const { endpoint } = courier();

export const api = defineApi({
  baseURL: "https://api.example.com",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    create: endpoint.post("").response<User>(),
  },
});
`;

/**
 * A flat source is merged like any other, not overwritten outright with
 * every edit to it lost without a word.
 */
describe("a source with its endpoints inline", () => {
  it("merges rather than overwrites", () => {
    const result = previewUpdate(
      { getAll: "unchanged-hash" },
      [{ path: "src/api/source.ts", content: GENERATED }],
      { "src/api/source.ts": USER_EDITED },
    );

    expect(result.files[0]?.status).not.toBe("safe");
    expect(result.files[0]?.content).toContain("mine:");
  });

  it("keeps what the declaration configures and takes the spec's endpoints", () => {
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "modified", create: "new", mine: "modified" },
      existingCode: {},
    };
    const { content } = mergeGroupFile(USER_EDITED, GENERATED, fingerprints);

    /* The declaration comes from the spec — that is where a changed baseURL
       arrives — and stays a defineApi rather than becoming a group. */
    expect(content).toContain("defineApi({");
    expect(content).not.toContain("defineGroup");
    expect(content).toContain('baseURL: "https://api.example.com"');

    /* The endpoints are merged: the user's edit and their own endpoint stay,
       and the one the spec added arrives. */
    expect(content).toContain('getAll: endpoint.get("archive")');
    expect(content).toContain("mine:");
    expect(content).toContain("create:");
  });

  it("keeps an option the user added to the declaration, and says so", () => {
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "modified", create: "new", mine: "modified" },
      existingCode: {},
    };
    const { content, changes } = mergeGroupFile(USER_EDITED, GENERATED, fingerprints);

    expect(content).toContain('proxyPath: { http: "/api/relay" },');
    expect(changes).toContainEqual({
      type: "preserved",
      target: "option:proxyPath",
      detail: "added by hand",
    });
  });
});
