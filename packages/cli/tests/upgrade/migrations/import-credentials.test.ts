import { describe, expect, it } from "vitest";

import { IMPORT_CREDENTIALS } from "../../../src/upgrade/migrations/import-credentials";
import { migrateWith } from "./migrate-with";

/* Made up for the test. */
const PASSWORD = "pw-made-up-41c7";
const KEY = "k3y-made-up-9f2c00aa11bb";
/* The read of an environment variable, as the instead writes it into a template. */
const read = (name: string) => `\${process.env.${name}}`;

const CONFIG = `import { defineConfig } from "@noverax/courier/config";

export default defineConfig({
  imports: {
    pets: {
      type: "openapi",
      importType: "url",
      from: "https://ana:${PASSWORD}@specs.example/pets.json",
    },
    "owner-list": { type: "openapi", importType: "url", from: \`https://specs.example/owners.json?api_key=${KEY}&page=2\` },
    orders: {
      importType: "url",
      from: "https://ops:${PASSWORD}@specs.example/orders.json?token=${KEY}",
      auth: { type: "bearer", token: { env: "ORDERS_TOKEN" } },
    },
    open: { importType: "url", from: "https://specs.example/open.json?version=2" },
  },
});
`;

describe("0.5.0: an import's from with a credential or a secret", () => {
  it("is found at its line, shown without the secret, with the variables to read it from", () => {
    const { text, findings } = migrateWith(IMPORT_CREDENTIALS, CONFIG);

    expect(text).toBe(CONFIG);
    expect(findings.map(({ line, instead }) => [line, instead])).toEqual([
      [
        8,
        [
          'from: "https://specs.example/pets.json",',
          'auth: { type: "basic", username: { env: "PETS_SPEC_USER" }, password: { env: "PETS_SPEC_PASSWORD" } },',
        ],
      ],
      [
        10,
        [
          `from: \`https://specs.example/owners.json?api_key=${read("OWNER_LIST_SPEC_API_KEY")}&page=2\`,`,
        ],
      ],
      [13, [`from: \`https://specs.example/orders.json?token=${read("ORDERS_SPEC_TOKEN")}\`,`]],
      [13, [`from: \`https://specs.example/orders.json?token=${read("ORDERS_SPEC_TOKEN")}\`,`]],
    ]);
    expect(findings[0]?.what).toMatch(
      /^Studio refuses a specification's address with a user or a password in it, with 400 SPEC_CREDENTIALS_IN_URL: .* --basic-env USER_VARIABLE:PASSWORD_VARIABLE$/,
    );
    expect(findings[1]?.what).toMatch(
      /courier-studio import --yes and Add to courier.config.ts leave its entry to you/,
    );
    expect(JSON.stringify(findings)).not.toContain(PASSWORD);
    expect(JSON.stringify(findings)).not.toContain(KEY);
    expect(JSON.stringify(findings)).not.toContain("ana");
  });

  it("finds nothing outside the imports of Courier's config, nor in an address the config computes", () => {
    const elsewhere = [
      `import { defineConfig } from "vite";
export default defineConfig({ imports: { pets: { from: "https://ana:${PASSWORD}@specs.example/pets.json" } } });
`,
      `import { defineConfig } from "@noverax/courier/config";
const key = process.env.PETS_KEY;
export default defineConfig({
  mirror: { from: "https://ana:${PASSWORD}@specs.example/pets.json" },
  imports: {
    pets: { importType: "url", from: \`https://specs.example/pets.json?api_key=\${key}\` },
    files: { importType: "url", from: "ftp://ana:${PASSWORD}@specs.example/pets.json" },
  },
});
`,
    ];

    for (const code of elsewhere)
      expect(migrateWith(IMPORT_CREDENTIALS, code).findings).toEqual([]);
  });
});
