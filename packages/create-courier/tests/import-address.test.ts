import { describe, expect, it } from "vitest";

import { importFrom, secretsPrefix } from "../src/import-address";

/* Made up for the test. */
const KEY = "k3y-made-up-9f2c00aa11bb";
const TOKEN = "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZg";
/* The read of an environment variable, as the line writes it into a template. */
const read = (name: string) => `\${process.env.${name}}`;

describe("an import's from as the config may keep it", () => {
  it("is the address as written where it carries no secret, its user and password left out", () => {
    expect(importFrom("https://specs.example/pets.json?page=2", "pets")).toEqual({
      line: 'from: "https://specs.example/pets.json?page=2",',
      variables: [],
    });
    expect(importFrom("https://ana:pw@specs.example/pets.json", "pets").line).toBe(
      'from: "https://specs.example/pets.json",',
    );
  });

  it("reads each secret from a variable named after the import and the parameter", () => {
    const from = importFrom(
      `https://specs.example/hooks/${TOKEN}/pets.json?api_key=${KEY}&page=2`,
      "owner-list",
    );

    expect(from.line).toBe(
      `from: \`https://specs.example/hooks/${read("OWNER_LIST_SPEC_SECRET")}/pets.json?api_key=${read("OWNER_LIST_SPEC_API_KEY")}&page=2\`,`,
    );
    expect(from.variables).toEqual(["OWNER_LIST_SPEC_SECRET", "OWNER_LIST_SPEC_API_KEY"]);
    expect(from.line).not.toContain(KEY);
    expect(from.line).not.toContain(TOKEN);
  });

  it("numbers the secrets no name gives away, and names the variables SPEC_ where the import has no name", () => {
    const from = importFrom(`https://specs.example/${TOKEN}/${TOKEN}x/pets.json`, undefined);

    expect(from.variables).toEqual(["SPEC_SECRET", "SPEC_SECRET_2"]);
    expect(secretsPrefix("1st")).toBe("SPEC");
    expect(secretsPrefix("pets")).toBe("PETS_SPEC");
  });

  it("names the variables after the letters and digits alone, whatever runs between and around them", () => {
    const from = importFrom(`https://specs.example/pets.json?--pet__id--=${TOKEN}`, "pets");

    expect(from.line).toBe(
      `from: \`https://specs.example/pets.json?--pet__id--=${read("PETS_SPEC_PET_ID")}\`,`,
    );
    expect(secretsPrefix("--pet  shop__v2--")).toBe("PET_SHOP_V2_SPEC");
    expect(secretsPrefix("Café menu")).toBe("CAF_MENU_SPEC");
    expect(secretsPrefix("_-_")).toBe("SPEC");
    expect(secretsPrefix("")).toBe("SPEC");
  });
});
