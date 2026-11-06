import { describe, expect, it } from "vitest";

import { PIN_HASH } from "../../../src/upgrade/migrations/pin-hash";
import { migrateWith } from "./migrate-with";

describe("0.5.0: an import's pinHash", () => {
  it("is found in the config, and left as written", () => {
    const code = `import { defineConfig } from "@noverax/courier/config";
import { api } from "./src/api";

export default defineConfig({
  sources: { api },
  imports: {
    pets: {
      type: "openapi",
      importType: "url",
      from: "https://example.com/pets.json",
      pinHash: "${"0123456789abcdef".repeat(4)}",
    },
    owners: { type: "openapi", importType: "url", from: "https://example.com/owners.json", "pinHash": "abc" },
  },
});
const elsewhere = { pinHash: "abc" };
`;

    const { text, findings } = migrateWith(PIN_HASH, code);

    expect(text).toBe(code);
    expect(findings.map((finding) => finding.line)).toEqual([11, 13]);
    expect(findings[0]?.what).toMatch(/409 SPEC_PIN_MISMATCH: import the specification again/);
  });

  it("finds none in a config that is not Courier's", () => {
    const { findings } = migrateWith(
      PIN_HASH,
      `import { defineConfig } from "vite";
export default defineConfig({ plugins: [], pinHash: "abc" });
`,
    );

    expect(findings).toEqual([]);
  });
});
