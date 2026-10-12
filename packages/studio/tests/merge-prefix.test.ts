/**
 * A merge never moves an endpoint the user kept to another URL. When the
 * spec gives the group a new prefix and a kept endpoint names its path other
 * than as a string, the group keeps the file's prefix if every endpoint fits
 * under it, and otherwise the file is left to the user.
 */
import { describe, expect, it } from "vitest";

import { mergeGroupFile } from "../src/apis/merge/merge-group";
import type { FingerprintResult } from "../src/apis/merge/types";

const ON_DISK = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

const BY_ID = ":id";

export const customers = defineGroup({
  prefix: "/v1/customers",
  endpoints: {
    getCustomer: endpoint.get(BY_ID).response<{ id: string; name: string }>(),
    listCustomers: endpoint.get("").response<string[]>(),
  },
});
`;

function generated(extra = ""): string {
  return `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const customers = defineGroup({
  prefix: "/v1",
  endpoints: {
    getCustomer: endpoint.get("customers/:id").response<{ id: string }>(),
    listCustomers: endpoint.get("customers").response<{ id: string }[]>(),
${extra}  },
});
`;
}

const KEPT: FingerprintResult = {
  endpoints: { getCustomer: "modified", listCustomers: "safe", getOrder: "new" },
  existingCode: {},
};

describe("a group whose prefix the spec changes, with a kept endpoint whose path is no string", () => {
  it("keeps the file's prefix, and writes the spec's endpoints under it", () => {
    const merged = mergeGroupFile(ON_DISK, generated(), KEPT);

    expect(merged.status).not.toBe("conflict");
    expect(merged.content).toContain('prefix: "/v1/customers",');
    expect(merged.content).toContain(
      "getCustomer: endpoint.get(BY_ID).response<{ id: string; name: string }>(),",
    );
    expect(merged.content).toContain(
      'listCustomers: endpoint.get("").response<{ id: string }[]>(),',
    );
    expect(merged.changes).toContainEqual({
      type: "updated",
      target: "prefix",
      detail: "/v1/customers, so every endpoint keeps its URL",
    });
  });

  it("leaves the file to the user when no prefix keeps every endpoint's URL", () => {
    const fresh = generated(
      '    getOrder: endpoint.get("orders/:id").response<{ id: string }>(),\n',
    );

    const merged = mergeGroupFile(ON_DISK, fresh, KEPT);

    expect(merged.status).toBe("conflict");
    expect(merged.content).toBe(fresh);
    expect(merged.changes[0]?.detail).toContain("keeps its URL");
    expect(merged.content).not.toContain("endpoint.get(BY_ID)");
  });
});
