/**
 * Import an API from an address behind auth: the editor asks which kind
 * of credentials the address takes and the environment variables that hold
 * them, and runs `courier-studio import` with their names alone, so no
 * value goes into the terminal or its history. A value typed where a name
 * goes is refused before anything runs.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  askCredentials,
  credentialArgs,
  headersProblem,
  variableProblem,
} from "../src/generate/import-credentials";
import { studioCommandLine } from "../src/generate/studio-cli";
import { asked } from "./vscode-stand-in";

const URL = "https://specs.example/orders.json";

beforeEach(() => {
  asked.picks.length = 0;
  asked.typed.length = 0;
  asked.refused.length = 0;
});

describe("the command an import behind auth runs", () => {
  it("names the variables that hold each credential, and no value", () => {
    const line = (args: string[]) => studioCommandLine(["import", URL, ...args], "darwin");

    expect(line(credentialArgs({ kind: "bearer", token: " ORDERS_SPEC_TOKEN " }))).toBe(
      "npx @noverax/courier-studio import https://specs.example/orders.json --bearer-env ORDERS_SPEC_TOKEN",
    );
    expect(
      line(credentialArgs({ kind: "basic", username: "SPEC_USER", password: "SPEC_PASSWORD" })),
    ).toBe(
      "npx @noverax/courier-studio import https://specs.example/orders.json --basic-env SPEC_USER:SPEC_PASSWORD",
    );
    expect(
      line(
        credentialArgs({
          kind: "header",
          headers: "X-Api-Key = ORDERS_API_KEY, X-Tenant=TENANT_ID",
        }),
      ),
    ).toBe(
      "npx @noverax/courier-studio import https://specs.example/orders.json --header-env X-Api-Key=ORDERS_API_KEY,X-Tenant=TENANT_ID",
    );
    expect(credentialArgs({ kind: "none" })).toEqual([]);
  });

  it("takes a variable's name, and refuses a value typed in its place", () => {
    expect(variableProblem("ORDERS_SPEC_TOKEN")).toBeUndefined();
    expect(variableProblem("sk_live_51HmadeUp9f2c")).toContain("capitals");
    expect(variableProblem("1TOKEN")).toBeDefined();
    expect(headersProblem("X-Api-Key=ORDERS_API_KEY,X-Tenant=TENANT_ID")).toBeUndefined();
    expect(headersProblem("X-Api-Key")).toContain("Header=VARIABLE");
    expect(headersProblem("X-Api-Key=k3y-made-up")).toContain("X-Api-Key");
  });
});

describe("asking for an address's credentials", () => {
  it("asks the kind, then each variable, typed again until it is a name", async () => {
    asked.picks.push("basic");
    asked.typed.push("ana-made-up", "SPEC_USER", "SPEC_PASSWORD");

    expect(await askCredentials()).toEqual(["--basic-env", "SPEC_USER:SPEC_PASSWORD"]);
    expect(asked.refused).toHaveLength(1);
  });

  it("asks nothing more for a public document, and runs nothing once the user gives up", async () => {
    asked.picks.push("none");
    expect(await askCredentials()).toEqual([]);

    asked.picks.push("bearer");
    expect(await askCredentials()).toBeUndefined();
  });
});
