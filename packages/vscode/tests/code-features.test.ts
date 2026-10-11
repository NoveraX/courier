/**
 * What the editor learns of the project's endpoints from Studio: from a
 * call — a hook's string name too — to the endpoint's declaration; from a
 * declaration or a call to every call site, the declaration with them when
 * asked; the declarations asked once, again after a save; and the endpoints
 * found by the letters typed in Go to Symbol in Workspace.
 */
import { describe, expect, it } from "vitest";

import { createDefinitionProvider } from "../src/code/definition-provider";
import { createDefinitionStore } from "../src/code/definition-store";
import { createEndpointSymbols } from "../src/code/endpoint-symbols";
import { createReferenceProvider } from "../src/code/reference-provider";
import type { HintStore } from "../src/hints/hint-store";
import type { CallSite, EndpointCall, EndpointDefinition } from "../src/studio/studio-types";
import { Position } from "./vscode-stand-in";

const STUDIO = "http://localhost:6280";
const ORDERS = "/work/shop/src/api/orders.ts";
const PLACE: EndpointDefinition = {
  source: "shop",
  endpoint: "orders.place",
  file: "src/api/orders.ts",
  path: ORDERS,
  line: 9,
  column: 5,
  endLine: 9,
  endColumn: 10,
  span: { line: 9, column: 5, endLine: 12, endColumn: 34 },
};
const HOOK: EndpointCall = {
  line: 3,
  column: 30,
  endLine: 3,
  endColumn: 37,
  endpoints: [{ source: "shop", endpoint: "orders.place" }],
};
const SITE: CallSite = {
  file: "src/cart.ts",
  path: "/work/shop/src/cart.ts",
  line: 3,
  column: 30,
  endLine: 3,
  endColumn: 37,
  code: 'q.orders.useMutation("place")',
};

const document = (path: string) =>
  ({
    uri: { scheme: "file", fsPath: path },
    languageId: "typescript",
    version: 1,
    getText: () => "",
  }) as never;
const store = {
  callsIn: async ({ file }: { file: string }) => ({
    studio: STUDIO,
    calls: file === SITE.path ? [HOOK] : [],
  }),
} as unknown as HintStore;

describe("the editor's knowledge of the project's endpoints", () => {
  it("goes from a hook's string name to the endpoint's declaration, the call's name underlined", async () => {
    const definitions = createDefinitionStore(async () => [PLACE]);
    const provider = createDefinitionProvider(store, definitions);

    const links = (await provider.provideDefinition(
      document(SITE.path),
      new Position(2, 31) as never,
      {} as never,
    )) as never as {
      targetUri: { fsPath: string };
      targetSelectionRange: { start: Position };
      originSelectionRange: { start: Position };
    }[];

    expect(links).toHaveLength(1);
    expect(links[0]?.targetUri.fsPath).toBe(ORDERS);
    expect(links[0]?.targetSelectionRange.start).toEqual(new Position(8, 4));
    expect(links[0]?.originSelectionRange.start).toEqual(new Position(2, 29));
  });

  it("lists every call site from the declaration, with the declaration when asked", async () => {
    const definitions = createDefinitionStore(async () => [PLACE]);
    const provider = createReferenceProvider(store, definitions, async () => [SITE]);
    const at = new Position(9, 8) as never;

    const all = await provider.provideReferences(
      document(ORDERS),
      at,
      { includeDeclaration: true },
      {} as never,
    );
    const calls = await provider.provideReferences(
      document(ORDERS),
      at,
      { includeDeclaration: false },
      {} as never,
    );

    expect(all?.map((each) => each.uri.fsPath)).toEqual([ORDERS, SITE.path]);
    expect(calls?.map((each) => each.uri.fsPath)).toEqual([SITE.path]);
  });

  it("asks Studio for the declarations once, and again after a save", async () => {
    let asked = 0;
    const definitions = createDefinitionStore(async () => {
      asked += 1;
      return [PLACE];
    });

    await definitions.definitionsFor(STUDIO);
    await definitions.definitionsIn(STUDIO, ORDERS);
    definitions.forget();
    await definitions.definitionsFor(STUDIO);

    expect(asked).toBe(2);
    expect(await definitions.definitionsIn(STUDIO, "/work/shop/src/other.ts")).toEqual([]);
  });

  it("finds an endpoint in Go to Symbol in Workspace by the letters typed, in order", async () => {
    const definitions = createDefinitionStore(async () => [PLACE]);
    const symbols = createEndpointSymbols(async () => [{ studio: STUDIO }], definitions);

    const found = await symbols.provideWorkspaceSymbols("ordpl", {} as never);
    const none = await symbols.provideWorkspaceSymbols("cancel", {} as never);

    expect(found?.map((each) => [each.name, each.containerName])).toEqual([
      ["orders.place", "shop"],
    ]);
    expect(none).toEqual([]);
  });
});
