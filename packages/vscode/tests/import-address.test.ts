/**
 * Import an API from an address: the field reads the address as a URL
 * parser does, so one with a user or a password is refused as it is typed,
 * however it is spelled, and no terminal opens for it — the credentials are
 * named by variable next. An address with a key in it is taken with a
 * warning that the key goes onto the command line, pointing to
 * `--header-env`. Every value is made up.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { registerCliCommands } from "../src/generate/cli-commands";
import { addressProblem } from "../src/generate/import-address";
import { asked, InputBoxValidationSeverity, registered, terminals } from "./vscode-stand-in";

const WITH_PASSWORD = "https://ci:Zq9x-made-up-pw@specs.example/orders.json";
const WITH_KEY = "https://specs.example/orders.json?api_key=k3y-made-up-5150";
const PLAIN = "https://specs.example/orders.json";

beforeEach(() => {
  for (const list of [asked.picks, asked.typed, asked.refused, asked.warned, terminals]) {
    list.length = 0;
  }
  const project = { name: "shop", root: "/work/shop" };
  registerCliCommands({
    projects: { list: async () => [project], projectOf: async () => undefined },
  } as never);
});

const importApi = () => registered.get("courier.importApi")?.();

describe("the address Import an API asks for", () => {
  it("is refused with a user or a password, in any spelling the parser reads them in", () => {
    for (const address of [
      WITH_PASSWORD,
      " https:\\\\ci:Zq9x-made-up-pw@specs.example/orders.json",
      "https:ci:Zq9x-made-up-pw@specs.example/orders.json",
    ]) {
      expect(addressProblem(address)).toContain("pick User and Password");
    }
    expect(addressProblem(PLAIN)).toBeUndefined();
    expect(addressProblem("specs.example/orders.json")).toBeUndefined();
  });

  it("is taken with a key in it, warned of, and pointed to --header-env", () => {
    expect(addressProblem(WITH_KEY)).toEqual({
      message: expect.stringContaining("--header-env"),
      severity: InputBoxValidationSeverity.Warning,
    });
    expect(addressProblem(`${PLAIN}?page=2`)).toBeUndefined();
  });
});

describe("Import an API from an address", () => {
  it("opens no terminal for an address with a password, refused as it was typed", async () => {
    asked.picks.push("url", "none");
    asked.typed.push(WITH_PASSWORD);

    await importApi();

    expect(asked.refused).toHaveLength(1);
    expect(terminals).toEqual([]);
  });

  it("runs once the address is typed again without the password, its variables named", async () => {
    asked.picks.push("url", "basic");
    asked.typed.push(WITH_PASSWORD, PLAIN, "SPEC_USER", "SPEC_PASSWORD");

    await importApi();

    expect(terminals).toHaveLength(1);
    expect(JSON.stringify(terminals)).toContain("SPEC_USER:SPEC_PASSWORD");
    expect(JSON.stringify(terminals)).not.toContain("Zq9x-made-up-pw");
  });

  it("warns of a key in the address, and runs as the user goes on", async () => {
    asked.picks.push("url", "none");
    asked.typed.push(WITH_KEY);

    await importApi();

    expect(asked.warned).toEqual([expect.stringContaining("--header-env")]);
    expect(asked.refused).toEqual([]);
    expect(terminals).toHaveLength(1);
  });
});
