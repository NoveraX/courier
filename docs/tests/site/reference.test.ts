/**
 * The API reference reads each export from its docs page, so the two never
 * part: the module its Import names, its Signature, the fields its
 * Parameters or Properties describe, and its first Basic Usage example.
 */
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { referenceEntry } from "@/site/content/reference"
import { referenceMarkdown } from "@/site/content/reference-markdown"

function page(name: string): string {
  return readFileSync(new URL(`../../src/content/docs/api/${name}.mdx`, import.meta.url), "utf8")
}

describe("a reference entry", () => {
  it("reads a function's module, signature, parameters and example from its page", () => {
    const entry = referenceEntry("create-caller", page("create-caller"), {
      title: "createCaller",
      description: "Direct mode.",
    })

    expect(entry).toMatchObject({
      id: "create-caller",
      kind: "FUNCTION",
      from: "@noverax/courier",
      importLine: 'import { createCaller } from "@noverax/courier"',
      desc: "Direct mode.",
    })
    expect(entry.signature?.code).toContain(
      "declare function createCaller<TApi extends DefinedApi>("
    )
    expect(entry.params.map((p) => p.name)).toEqual(["api", "CallerDefaults"])
    expect(entry.params[0]?.desc).toBe("An API source definition created with `defineApi()`.")
    expect(entry.example?.language).toBe("ts")
  })

  it("reads a type's module from the type import its page writes", () => {
    const entry = referenceEntry("call-options", page("call-options"), {
      title: "CallOptions",
      description: "",
    })

    expect(entry).toMatchObject({
      kind: "TYPE",
      from: "@noverax/courier",
      importLine: 'import type { CallOptions, WithOptions } from "@noverax/courier"',
    })
    expect(entry.params.map((p) => p.name)).toContain("onUploadProgress")
  })

  it("names no module from a signature's own type imports", () => {
    const entry = referenceEntry("create-test-client", page("create-test-client"), {
      title: "createTestClient",
      description: "",
    })

    expect(entry.from).toBe("@noverax/courier/testing")
    expect(entry.params.map((p) => p.name)).toEqual([
      "client",
      "mock",
      "history",
      "reset",
      "resetMocks",
      "resetHistory",
    ])
  })

  it("reads a class from its own heading, and its properties as its fields", () => {
    const entry = referenceEntry("http-error", page("http-error"), {
      title: "HTTPError",
      description: "",
    })

    expect(entry.kind).toBe("CLASS")
    expect(entry.params.map((p) => p.name)).toEqual([
      "status",
      "headers",
      "data",
      "name",
      "message",
    ])
  })

  it("reads the type a parameter's page writes out, and the parts of it the page lists", () => {
    const entry = referenceEntry("define-group", page("define-group"), {
      title: "defineGroup",
      description: "",
    })

    const [config] = entry.params
    expect(config?.name).toBe("DefineGroupConfig")
    expect(config?.code?.code).toContain("type DefineGroupConfig<E> = GroupOptions & {")
    expect(config?.fields.map((f) => f.name)).toEqual([
      "prefix",
      "pathOptions",
      "expose",
      "cancelPrevious",
      "groups",
      "endpoints",
    ])
  })

  it("lists only the parts written outside a parameter's code", () => {
    const source = [
      "## Parameters",
      "### Options",
      "```ts",
      "- `inside` — part of the code",
      "```",
      "- `outside` — a listed part",
    ].join("\n")

    const entry = referenceEntry("a", source, { title: "a", description: "" })

    expect(entry.params[0]?.fields).toEqual([{ name: "outside", desc: "a listed part" }])
  })

  it("copies the import a page without an Import block writes in its first code, and none it never writes; a capitalised name with no class is a type", () => {
    const config = referenceEntry("config", page("config"), {
      title: "courier.config.ts",
      description: "",
    })
    const client = referenceEntry("instance", page("instance"), {
      title: "HttpClient",
      description: "",
    })

    expect(config.importLine).toBe('import { defineConfig } from "@noverax/courier/config"')
    expect(client).toMatchObject({ from: "", importLine: "", kind: "TYPE" })
  })

  it("never takes a heading inside a code block for a part of the page", () => {
    const source = ["## Signature", "```ts", "## not a heading", "type A = 1", "```"].join("\n")

    const entry = referenceEntry("a", source, { title: "A", description: "" })

    expect(entry.signature?.code).toBe("## not a heading\ntype A = 1")
    expect(entry.kind).toBe("TYPE")
  })
})

describe("the reference as Markdown", () => {
  it("lists the entry points, then each export with its module, signature, fields and example", () => {
    const md = referenceMarkdown(
      [
        {
          name: "createCaller",
          importLine: 'import { createCaller } from "@noverax/courier"',
          desc: "Direct mode.",
          params: [{ name: "api", desc: "The API.", fields: [] }],
          signature: { code: "declare function createCaller(): void" },
          example: null,
        },
      ],
      [{ module: "@noverax/courier", note: "createCaller" }]
    )

    expect(md).toBe(
      [
        "# API reference — @noverax/courier",
        "",
        "## Entry points",
        "",
        "- `@noverax/courier` — createCaller",
        "",
        "## createCaller",
        "",
        "```ts",
        'import { createCaller } from "@noverax/courier"',
        "```",
        "",
        "Direct mode.",
        "",
        "```ts",
        "declare function createCaller(): void",
        "```",
        "",
        "- `api` — The API.",
        "",
      ].join("\n")
    )
  })

  it("writes a parameter's type under it, then the parts of it the page lists", () => {
    const md = referenceMarkdown(
      [
        {
          name: "defineGroup",
          importLine: "",
          desc: "Groups endpoints.",
          params: [
            {
              name: "DefineGroupConfig",
              desc: "",
              code: { code: "type DefineGroupConfig = {\n  prefix?: string\n}" },
              fields: [{ name: "prefix", desc: "Prepended to every path." }],
            },
          ],
          signature: null,
          example: null,
        },
      ],
      []
    )

    expect(md.split("\n").slice(5)).toEqual([
      "## defineGroup",
      "",
      "Groups endpoints.",
      "",
      "- `DefineGroupConfig`",
      "",
      "  ```ts",
      "  type DefineGroupConfig = {",
      "    prefix?: string",
      "  }",
      "  ```",
      "",
      "  - `prefix` — Prepended to every path.",
      "",
    ])
  })
})
