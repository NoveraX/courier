/**
 * The comments a user writes in a group file survive a merge of a new
 * import: a note above an endpoint stays with it whatever becomes of its
 * code, and an endpoint the user wrote comments into is kept as it is, the
 * change list saying so, rather than replaced by the spec's version.
 */
import { describe, expect, it } from "vitest";

import { mergeGroupFile } from "../src/apis/merge/merge-group";
import type { FingerprintResult } from "../src/apis/merge/types";

function file(endpoints: string): string {
  return `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
${endpoints}  },
});
`;
}

const GENERATED = file(`    listUsers: endpoint.get("").response<{ id: string }[]>(),
    /** Creates a user */
    createUser: endpoint.post("").response<string>(),
`);

const SAFE: FingerprintResult = {
  endpoints: { listUsers: "safe", createUser: "safe" },
  existingCode: {},
};

describe("a note above an endpoint", () => {
  it("stays above it once the spec has changed it, and above its new doc comment", () => {
    const onDisk = file(`    // Reads — cached by the gateway
    listUsers: endpoint.get("").response<string[]>(),

    // Writes — the billing team owns these
    /** Makes a user */
    createUser: endpoint.post("").response<string>(),
`);

    const merged = mergeGroupFile(onDisk, GENERATED, SAFE);

    expect(merged.status).not.toBe("conflict");
    expect(merged.content).toContain(`    // Reads — cached by the gateway
    listUsers: endpoint.get("").response<{ id: string }[]>(),`);
    expect(merged.content).toContain(`    // Writes — the billing team owns these
    /** Creates a user */
    createUser: endpoint.post("").response<string>(),`);
  });

  it("stays above an endpoint the user added", () => {
    const onDisk = file(`    listUsers: endpoint.get("").response<{ id: string }[]>(),
    /** Creates a user */
    createUser: endpoint.post("").response<string>(),
    /* The dashboard's health check, not in the spec */
    pingUsers: endpoint.get("ping").response<string>(),
`);

    const merged = mergeGroupFile(onDisk, GENERATED, SAFE);

    expect(merged.content).toContain(`    /* The dashboard's health check, not in the spec */
    pingUsers: endpoint.get("ping").response<string>(),`);
  });
});

describe("a comment written into an endpoint", () => {
  it("keeps the endpoint as it is, at the end of a line, and says the spec's change is not applied", () => {
    const onDisk = file(`    listUsers: endpoint.get("").response<string[]>(), // ids only until v2
    /** Creates a user */
    createUser: endpoint.post("").response<string>(),
`);

    const merged = mergeGroupFile(onDisk, GENERATED, SAFE);

    expect(merged.content).toContain(
      `    listUsers: endpoint.get("").response<string[]>(), // ids only until v2\n    /** Creates a user */`,
    );
    expect(merged.changes).toContainEqual({
      type: "preserved",
      target: "endpoint:listUsers",
      detail: "holds comments written by hand, so the spec's change to it is not applied",
    });
  });

  it("keeps the endpoint as it is inside it, and changes nothing the spec did not", () => {
    const multiline = (comment: string) =>
      file(`    listUsers: endpoint
      .get("")${comment}
      .response<{ id: string }[]>(),
    /** Creates a user */
    createUser: endpoint.post("").response<string>(),
`);
    const onDisk = multiline("\n      // the gateway caches this for a minute");

    const merged = mergeGroupFile(onDisk, multiline(""), SAFE);

    expect(merged.content).toContain("      // the gateway caches this for a minute\n");
    expect(merged.changes).toContainEqual({
      type: "preserved",
      target: "endpoint:listUsers",
      detail: "holds comments written by hand",
    });
  });

  it("is told apart from the comments the spec's version of the endpoint has itself", () => {
    const commented =
      file(`    listUsers: endpoint.get("").response<{ id: string }[]>(), /* paged */
    /** Creates a user */
    createUser: endpoint.post("").response<string>(),
`);

    const merged = mergeGroupFile(commented, commented, SAFE);

    expect(merged.changes).toContainEqual({
      type: "updated",
      target: "endpoint:listUsers",
      detail: "from spec",
    });
  });
});
