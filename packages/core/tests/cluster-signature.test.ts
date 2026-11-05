/**
 * Cluster messages signed with the cluster's secret: a replica with the same
 * secret verifies what another signed, whatever order its fields travelled
 * in, and refuses one changed after it was signed, one signed with another
 * secret, and one that carries no signature.
 */
import { describe, expect, it } from "vitest";

import type { ClusterMessage } from "../src/adapter/cluster-message";
import { createClusterSigner } from "../src/adapter/cluster-signature";

const SECRET = "a-cluster-secret-of-32-bytes-or-more";

const message: ClusterMessage = {
  v: 1,
  id: "7d0f3f9e-6b8a-4c55-9a51-3c0e4b5f2a10",
  at: 1_700_000_000_000,
  cmd: {
    kind: "disconnect",
    selector: { meta: { userId: "u1", tier: 2 } },
    code: 4001,
    reason: "Signed out",
  },
};

describe("createClusterSigner", () => {
  it("signs a message so that a replica with the same secret verifies it", async () => {
    const sig = await createClusterSigner(SECRET).sign(message);

    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(await createClusterSigner(SECRET).verify({ ...message, sig })).toBe(true);
  });

  it("verifies a message whatever order its fields arrived in", async () => {
    const signer = createClusterSigner(SECRET);
    const sig = await signer.sign(message);
    const reordered = {
      sig,
      cmd: {
        reason: "Signed out",
        code: 4001,
        selector: { meta: { tier: 2, userId: "u1" } },
        kind: "disconnect",
      },
      at: message.at,
      id: message.id,
      v: 1,
    } as ClusterMessage;

    expect(await signer.verify(reordered)).toBe(true);
  });

  it.each([
    ["its id", { ...message, id: "another" }],
    ["its time", { ...message, at: message.at + 1 }],
    ["its code", { ...message, cmd: { ...message.cmd, code: 4003 } }],
    [
      "who it selects",
      { ...message, cmd: { ...message.cmd, selector: { meta: { userId: "u2", tier: 2 } } } },
    ],
    ["its kind", { ...message, cmd: { kind: "require-auth", selector: "c1" } }],
  ] as Array<[string, ClusterMessage]>)(
    "refuses a message whose %s changed once it was signed",
    async (_case, changed) => {
      const signer = createClusterSigner(SECRET);
      const sig = await signer.sign(message);

      expect(await signer.verify({ ...changed, sig })).toBe(false);
    },
  );

  it("refuses a message signed with another secret", async () => {
    const sig = await createClusterSigner("another-secret-of-32-bytes-or-more!").sign(message);

    expect(await createClusterSigner(SECRET).verify({ ...message, sig })).toBe(false);
  });

  it.each([
    ["no signature", undefined],
    ["a signature that is no digest", "not-a-digest"],
    ["a digest of the wrong length", "ab".repeat(31)],
    ["a digest in upper case", "AB".repeat(32)],
  ])("refuses a message with %s", async (_case, sig) => {
    const signer = createClusterSigner(SECRET);

    expect(await signer.verify(sig === undefined ? message : { ...message, sig })).toBe(false);
  });
});
