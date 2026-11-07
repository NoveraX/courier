/**
 * The code the live examples' pages show beside their sandboxes compiles
 * against the site itself, as `check:docs` compiles the docs' samples.
 * Each string a page holds — a `const …Code`, the singleton page's samples
 * — is a module beside its page, so `./actions` and `@/lib/query` are the
 * modules the sandbox runs, and `routes` from `@noverax/courier/routes`
 * holds the site's, its config registered as a reader's app registers
 * theirs. A name a sample uses without importing it is imported for it:
 * from the site, where the site exports it — `caller`, `q`, `users` — and
 * otherwise from the package entry that exports it, as the docs' check
 * imports it. What the docs' check leaves out of a sample is left out here
 * by its own rules: a name only the reader declares, a parameter typed by
 * nothing, what is built on either.
 *
 * A sample whose routes name a source the site has not shows a reader's
 * app with backends of its own: its config is anything here, as in the
 * docs' check, and its calls are what the docs' check makes of them.
 *
 * Each string names the side whose code it is, as a fence names a
 * sample's, in a comment of its own before it: `// side="page"`,
 * `"server"`, or `"both"` for a string that shows each side's part. It
 * takes Courier's names from that side's entries, by the docs' own rule,
 * and a name it uses without importing it is imported from them.
 */
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { sources } from "@/api"

import { ENTRIES } from "../../../scripts/check-doc-samples.mjs"
import { importHeader } from "../../../scripts/doc-samples.mjs"
import { entryProblems } from "../../../scripts/sample-entries.mjs"
import { isOmission, samplesLeavingOut } from "../../../scripts/sample-omissions.mjs"

const DOCS = fileURLToPath(new URL("../../", import.meta.url))
const EXAMPLES = join(DOCS, "src/app/docs/examples")

/* The site's modules a sample's names come from, before the packages' entries: its callers, its
   routes, its API and its groups. */
const SITE_MODULES = [
  "@/lib/caller",
  "@/lib/query",
  "@/lib/routes",
  "@/api",
  "@/api/users",
  "@/api/posts",
  "@/api/files",
  "@/api/misc",
  "@/api/echo",
]

/* A name each group module of the site declares and none exports: its groups' endpoint builder. */
const ENDPOINT = [
  'import { courier as groupsOf } from "@noverax/courier/define"',
  "const { endpoint } = groupsOf()",
]

/* `routes` as the site's build would give it: the site's config, registered as a reader's app
   registers theirs. */
const SITE_CONFIG = [
  'import type config from "./courier.config"',
  'declare module "@noverax/courier/routes" {',
  "  interface Register {",
  "    config: typeof config",
  "  }",
  "}",
].join("\n")

/* A reader's config, registered as the docs register it: from a module of the reader's app, which
   no check finds. */
const READER_CONFIG = SITE_CONFIG.replace('"./courier.config"', '"reader-app/courier.config"')

const PROBE = join(DOCS, "__shown-entries.ts")
const REGISTER = join(DOCS, "__shown-register.ts")

/* Next.js's own types, which the site's program takes from the next-env.d.ts that next writes as
   it builds: a checkout that has not built yet has none, so they are named here. */
const NEXT_ENV = join(DOCS, "__shown-next-env.d.ts")
const NEXT_TYPES =
  '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n'

/** A string of code an example page shows, where it is written, and the side it names. */
interface ShownCode {
  readonly page: string
  readonly name: string
  readonly line: number
  readonly code: string
  readonly side?: string
  readonly root?: string
}

/* The side a string names, and why it shows the root where it does, as a fence writes them. */
const MARK = /^\/\/ side="([^"]*)"(?: root="([^"]*)")?$/

/* The marks of a string: those of the comments before its declaration, a property's or a const's. */
function marksOf(source: ts.SourceFile, node: ts.Node): Pick<ShownCode, "side" | "root"> {
  const declared = ts.isVariableDeclaration(node) ? node.parent.parent : node
  for (const range of ts.getLeadingCommentRanges(source.text, declared.getFullStart()) ?? []) {
    const mark = MARK.exec(source.text.slice(range.pos, range.end))
    if (mark) return { side: mark[1], ...(mark[2] !== undefined && { root: mark[2] }) }
  }
  return {}
}

/* The strings a page's module holds, and the names of those that are not a string alone. */
function shownCode(file: string): { shown: ShownCode[]; unread: string[] } {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const page = relative(DOCS, file)
  const shown: ShownCode[] = []
  const unread: string[] = []
  const take = (name: string, value: ts.Expression, declared: ts.Node) => {
    if (!ts.isNoSubstitutionTemplateLiteral(value) && !ts.isStringLiteral(value)) {
      unread.push(`${page} ${name}`)
      return
    }
    const line = source.getLineAndCharacterOfPosition(value.getStart(source)).line + 1
    shown.push({ page, name, line, code: value.text, ...marksOf(source, declared) })
  }
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /Code$/.test(node.name.text) &&
      node.initializer
    ) {
      take(node.name.text, node.initializer, node)
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      file.endsWith("-samples.ts")
    ) {
      take(node.name.text, node.initializer, node)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { shown, unread }
}

const read = readdirSync(EXAMPLES, { recursive: true, encoding: "utf8" })
  .filter((path) => /(?:^|\/)(?:page\.tsx|[\w-]+-samples\.ts)$/.test(path))
  .map((path) => shownCode(join(EXAMPLES, path)))
const shown = read.flatMap((page) => page.shown)

/* Where a string compiles: a module beside its page, so its relative imports are the page's. */
const fileOf = (code: ShownCode) => join(DOCS, dirname(code.page), `__shown-${code.name}.tsx`)

const config = ts.parseJsonConfigFileContent(
  ts.readConfigFile(join(DOCS, "tsconfig.json"), ts.sys.readFile).config,
  ts.sys,
  DOCS
)
const OPTIONS: ts.CompilerOptions = { ...config.options, noEmit: true, incremental: false }

/* A program of the site's files and of these, which are not on disk, with Next.js's types. */
function programOf(strings: ReadonlyMap<string, string>): ts.Program {
  const files = new Map([...strings, [NEXT_ENV, NEXT_TYPES]])
  const host = ts.createCompilerHost(OPTIONS, true)
  const base = {
    getSourceFile: host.getSourceFile,
    fileExists: host.fileExists,
    readFile: host.readFile,
  }
  host.fileExists = (file) => files.has(file) || base.fileExists(file)
  host.readFile = (file) => files.get(file) ?? base.readFile(file)
  host.getSourceFile = (file, language, ...rest) => {
    const text = files.get(file)
    return text === undefined
      ? base.getSourceFile(file, language, ...rest)
      : ts.createSourceFile(file, text, language, true)
  }
  return ts.createProgram([...files.keys()], OPTIONS, host)
}

/* A string as a module, after the lines that import what it uses without importing it. */
function textOf(code: ShownCode, head: readonly string[]): string {
  const module = /^\s*(?:import|export)\s/m.test(code.code) ? "" : "\nexport {}\n"
  return `${head.join("\n")}\n${code.code}\n${module}`
}

/* The diagnostics of the strings alone: the site's own files are its type check's. */
function diagnosticsOf(program: ts.Program, files: Iterable<string>): ts.Diagnostic[] {
  return [...files].flatMap((file) =>
    ts.getPreEmitDiagnostics(program, program.getSourceFile(file))
  )
}

/* Which module exports each name, read off the probe's imports: the first of them to export it. */
function exportedNames(program: ts.Program): Map<string, string> {
  const checker = program.getTypeChecker()
  const exported = new Map<string, string>()
  for (const statement of program.getSourceFile(PROBE)?.statements ?? []) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue
    const module = checker.getSymbolAtLocation(statement.moduleSpecifier)
    for (const name of module ? checker.getExportsOfModule(module) : []) {
      if (!exported.has(name.name)) exported.set(name.name, statement.moduleSpecifier.text)
    }
  }
  return exported
}

/* What a program says of a file of its own that is no string of code: the probe, the config's
   registration. */
function ownProblems(program: ts.Program, file: string): string[] {
  return ts
    .getPreEmitDiagnostics(program, program.getSourceFile(file))
    .filter((diagnostic) => diagnostic.file !== undefined)
    .map((diagnostic) => {
      const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")
      return `${relative(DOCS, file)} TS${diagnostic.code} ${text}`
    })
}

/* The import lines each string is missing, for the names it uses and never declares; and the
   site's modules the probe does not find. */
function headsOf(): { heads: Map<string, string[]>; unfound: string[] } {
  const files = new Map(shown.map((code) => [fileOf(code), textOf(code, [])]))
  const modules = [...SITE_MODULES, ...ENTRIES]
  const program = programOf(
    new Map([
      ...files,
      [PROBE, modules.map((module, n) => `import * as m${n} from "${module}"`).join("\n")],
    ])
  )
  const unfound = ownProblems(program, PROBE).filter((problem) => / TS2307 .*'@\//.test(problem))
  const missing = new Map<string, string[]>()
  for (const diagnostic of diagnosticsOf(program, files.keys())) {
    if ((diagnostic.code !== 2304 && diagnostic.code !== 2552) || !diagnostic.file) continue
    const name = /Cannot find name '([^']+)'/.exec(
      ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")
    )?.[1]
    if (name !== undefined)
      missing.set(diagnostic.file.fileName, [
        ...(missing.get(diagnostic.file.fileName) ?? []),
        name,
      ])
  }
  const exported = exportedNames(program)
  const sides = new Map(shown.map((code) => [fileOf(code), code.side]))
  const heads = new Map(
    [...missing].map(([file, names]) => [
      file,
      [
        ...importHeader(names, exported, sides.get(file)),
        ...(names.includes("endpoint") ? ENDPOINT : []),
      ],
    ])
  )
  return { heads, unfound }
}

/* What does not compile of these strings, as `page:line name TScode message`, at the line the page
   writes it on. */
function problemsOf(
  codes: readonly ShownCode[],
  heads: ReadonlyMap<string, readonly string[]>,
  readers: boolean
) {
  if (codes.length === 0) return []
  const byFile = new Map(codes.map((code) => [fileOf(code), code]))
  const files = new Map(
    codes.map((code) => [fileOf(code), textOf(code, heads.get(fileOf(code)) ?? [])])
  )
  const program = programOf(new Map([...files, [REGISTER, readers ? READER_CONFIG : SITE_CONFIG]]))
  const diagnostics = diagnosticsOf(program, files.keys())
  const leavingOut = samplesLeavingOut(diagnostics)
  /* The site's config is registered, or its routes would be anything, as a reader's are. */
  const registered = readers ? [] : ownProblems(program, REGISTER)
  return registered.concat(
    diagnostics.flatMap((diagnostic) => {
      const code = diagnostic.file && byFile.get(diagnostic.file.fileName)
      if (!diagnostic.file || !code || diagnostic.start === undefined) return []
      const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")
      /* The site's modules are no reader's to leave out: one a string imports is there. */
      const siteModule = diagnostic.code === 2307 && /'(?:@\/|\.)/.test(text)
      const standIn = readers || leavingOut.has(diagnostic.file.fileName)
      if (
        !siteModule &&
        isOmission(diagnostic.code, text, { page: code.page, code: code.code, standIn })
      )
        return []
      const head = (heads.get(fileOf(code)) ?? []).join("\n").split("\n").length
      const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      return [`${code.page}:${code.line + line - head} ${code.name} TS${diagnostic.code} ${text}`]
    })
  )
}

/* A string whose routes name a source the site has not: a reader's app. */
const SOURCES = new Set(Object.keys(sources))
const ofReader = (code: ShownCode) =>
  [...code.code.matchAll(/\broutes\.(\w+)/g)].some(([, name]) => !SOURCES.has(name))

describe("the code an example page shows", () => {
  it("is read on every examples page, each string of it", () => {
    expect(new Set(shown.map((code) => dirname(code.page))).size).toBe(15)
    expect(shown.length).toBeGreaterThanOrEqual(50)
    expect(read.flatMap((page) => page.unread)).toEqual([])
  })

  it("compiles against the site's own modules", () => {
    const { heads, unfound } = headsOf()
    expect(unfound).toEqual([])
    const problems = [
      ...problemsOf(
        shown.filter((code) => !ofReader(code)),
        heads,
        false
      ),
      ...problemsOf(shown.filter(ofReader), heads, true),
    ]
    expect(problems).toEqual([])
  }, 60_000)

  it("reads a sample of a reader's app by the routes it names", () => {
    expect(shown.filter(ofReader).map((code) => code.name)).toEqual(["multiInstance"])
  })

  it("names its side, each string of it", () => {
    const unmarked = shown.filter((code) => code.side === undefined)
    expect(unmarked.map((code) => `${code.page}:${code.line} ${code.name}`)).toEqual([])
  })

  it("takes Courier's names from its side's entries", () => {
    expect(entryProblems(shown)).toEqual([])
  })

  it("is refused the root's names, or the server's entry, in a page's code", () => {
    const shownCatch = shown.find((code) => code.name === "catchCode")
    if (shownCatch === undefined) throw new Error("the errors page shows no catchCode")
    const { page, line, code } = shownCatch
    const fromRoot = code.replace('"@noverax/courier/client"', '"@noverax/courier"')
    const fromServer = `import { createHandler } from "@noverax/courier/server"\n${code}`
    expect(
      entryProblems([
        { ...shownCatch, code: fromRoot },
        { ...shownCatch, code: fromServer },
      ])
    ).toEqual([
      expect.stringContaining(`${page}:${line} a page's sample imports "@noverax/courier":`),
      expect.stringContaining(`${page}:${line} a page's sample imports "@noverax/courier/server":`),
    ])
  })
})
