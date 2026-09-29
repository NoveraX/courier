import { describe, expect, it } from "vitest";
import { mergeGroupFile } from "../src/apis/merge/merge-group";
import { parseExistingGroup } from "../src/apis/merge/parse-existing";
import type { FingerprintResult } from "../src/apis/merge/types";

const GENERATED = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    create: endpoint.post("").response<User>(),
  },
});
`;

function withPreamble(preamble: string, endpoints: string): string {
  return `import { courier, defineGroup } from "@noverax/courier/define";

${preamble}

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
${endpoints}
  },
});
`;
}

const fingerprints: FingerprintResult = {
  endpoints: { getAll: "modified", create: "new" },
  existingCode: {},
};

/**
 * The generator writes `const { endpoint } = courier()`, but the file it merges
 * into may name that base differently. Endpoints have to be recognised — and
 * written back — in whichever name resolves in that file.
 */
describe("a base the file named its own way", () => {
  it("reads a renamed destructuring", () => {
    const parsed = parseExistingGroup(
      withPreamble("const { endpoint: ep } = courier();", '    getAll: ep.get("archive"),'),
    );

    expect(parsed.baseName).toBe("ep");
    expect(Object.keys(Object.fromEntries(parsed.endpoints.map((e) => [e.name, e])))).toEqual([
      "getAll",
    ]);
  });

  it("reads a base kept whole", () => {
    const parsed = parseExistingGroup(
      withPreamble("const api = courier();", '    getAll: api.endpoint.get("archive"),'),
    );

    expect(parsed.baseName).toBe("api.endpoint");
  });

  it("keeps the user's endpoints and writes new ones in their name", () => {
    const renamed = withPreamble(
      "const { endpoint: ep } = courier();",
      '    getAll: ep.get("archive").response<User[]>(),\n    mine: ep.get("mine").response<User[]>(),',
    );

    const { content } = mergeGroupFile(renamed, GENERATED, fingerprints);

    expect(content).toContain("const { endpoint: ep } = courier();");
    expect(content).not.toContain("endpoint, endpoint:");
    expect(content).toContain('getAll: ep.get("archive")');
    expect(content).toContain("mine:");
    expect(content).toContain('create: ep.post("")');
    expect(content).not.toMatch(/^\s+create: endpoint\./m);
  });

  it("does the same for a base kept whole", () => {
    const named = withPreamble(
      "const api = courier();",
      '    getAll: api.endpoint.get("archive").response<User[]>(),',
    );

    const { content } = mergeGroupFile(named, GENERATED, fingerprints);

    expect(content).toContain("const api = courier();");
    expect(content).toContain('getAll: api.endpoint.get("archive")');
    expect(content).toContain('create: api.endpoint.post("")');
  });
});
