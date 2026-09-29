/**
 * Where an endpoint of a file on disk ends, when a new import is merged into
 * it. Counting brackets line by line, a chain written over several lines was
 * cut at the first line whose brackets balanced — its variables, answer and
 * `.reads()` silently gone — and a bracket in a comment or a string moved
 * where an endpoint ended, writing endpoints twice. The endpoints are now
 * read from the file's syntax.
 */
import { describe, expect, it } from "vitest";

import { extractEndpoints } from "../src/apis/merge/extract-endpoints";
import { mergeGroupFile } from "../src/apis/merge/merge-group";
import { readsAsDeclaration } from "../src/apis/merge/reads-as-declaration";
import type { FingerprintResult } from "../src/apis/merge/types";

const GENERATED = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    listUsers: endpoint.get("").response<string[]>(),
    createUser: endpoint.post("").response<string>(),
  },
});
`;

function existing(endpoints: string): string {
  return GENERATED.replace(
    `    listUsers: endpoint.get("").response<string[]>(),
    createUser: endpoint.post("").response<string>(),
`,
    endpoints,
  );
}

const SAFE: FingerprintResult = {
  endpoints: { listUsers: "safe", createUser: "safe" },
  existingCode: {},
};

describe("an endpoint written over several lines", () => {
  const file = existing(`    listUsers: endpoint.get("").response<string[]>(),
    createUser: endpoint.post("").response<string>(),
    searchUsers: endpoint
      .post("search")
      .variables<{ q: string }>()
      .response<string[]>()
      .reads(),
`);

  it("is read whole", () => {
    expect(extractEndpoints(file).searchUsers).toContain(".reads(),");
  });

  it("is kept whole by a merge", () => {
    const merged = mergeGroupFile(file, GENERATED, SAFE);

    expect(merged.content).toContain(`    searchUsers: endpoint
      .post("search")
      .variables<{ q: string }>()
      .response<string[]>()
      .reads(),`);
    expect(readsAsDeclaration("users.ts", merged.content)).toBe(true);
  });
});

describe("a bracket inside a comment or a string", () => {
  const file = existing(`    listUsers: endpoint // prefer .get( for the remote wire
      .get("")
      .response<string[]>(),
    createUser: endpoint.post("(").response<string>(),
`);

  it("does not move where an endpoint ends", () => {
    /* Edited by hand, the endpoint is kept as the file has it. */
    const edited: FingerprintResult = {
      ...SAFE,
      endpoints: { ...SAFE.endpoints, listUsers: "modified" },
    };
    const merged = mergeGroupFile(file, GENERATED, edited);

    expect(merged.content.match(/createUser:/g)).toHaveLength(1);
    expect(merged.content.match(/listUsers:/g)).toHaveLength(1);
    expect(readsAsDeclaration("users.ts", merged.content)).toBe(true);
  });
});

describe("an endpoint that does not start from the file's builder", () => {
  const file = existing(`    listUsers: endpoint.get("").response<string[]>(),
    createUser: endpoint.post("").response<string>(),
    legacy: legacyEndpoints.find,
`);

  it("is read, and kept by a merge as the user's own", () => {
    const merged = mergeGroupFile(file, GENERATED, SAFE);

    expect(Object.keys(extractEndpoints(file))).toContain("legacy");
    expect(merged.content).toContain("    legacy: legacyEndpoints.find,");
    expect(merged.changes).toContainEqual({
      type: "preserved",
      target: "endpoint:legacy",
      detail: "user-added endpoint",
    });
  });
});
