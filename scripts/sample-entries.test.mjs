/**
 * Self-test for `scripts/sample-entries.mjs`. The docs and READMEs taught
 * `@noverax/courier` in 186 samples, page code with "use client" among
 * them, after the core gave a page `/client` and a server `/server`: a
 * reader copying a page's sample took the server's part into the page.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { entryProblems } from "./sample-entries.mjs";

const ENTRY_EXPORTS = JSON.parse(
  readFileSync(new URL("../packages/core/entry-exports.json", import.meta.url), "utf8"),
);
const CLIENTS = new Set(ENTRY_EXPORTS["./client"].values);
/* The values a page takes from the root alone, and the server's: those /server gives and /client leaves out besides. */
const ROOT_ONLY = Object.keys(ENTRY_EXPORTS["./client"].rootOnly);
const SERVERS = ENTRY_EXPORTS["./server"].values.filter(
  (name) => !CLIENTS.has(name) && !ROOT_ONLY.includes(name),
);

/* A sample as the samples check reads it: its page, the line of its first code line, its side. */
function sample(code, side, extra = {}) {
  return { page: "p.mdx", line: 10, jsx: false, code, side, ...extra };
}

const problemsOf = (...samples) => entryProblems(samples);

describe("a page's sample", () => {
  it("takes Courier's names from /client", () => {
    expect(
      problemsOf(sample('import { createProxyCaller } from "@noverax/courier/client"\n', "page")),
    ).toEqual([]);
  });

  it("is refused the root and /server, each at the line it imports it on", () => {
    const problems = problemsOf(
      sample(
        'import { routes } from "@noverax/courier/routes"\nimport { isHTTPError } from "@noverax/courier"\n',
        "page",
      ),
      sample('import { isHTTPError } from "@noverax/courier/server"\n', "page", { line: 20 }),
    );

    expect(problems).toEqual([
      expect.stringMatching(
        /^p\.mdx:11 a page's sample imports "@noverax\/courier": .*"@noverax\/courier\/client"/,
      ),
      expect.stringMatching(/^p\.mdx:20 a page's sample imports "@noverax\/courier\/server": /),
    ]);
  });

  it("is told where a name the root alone gives a page comes from: /server, or the root with its reason", () => {
    const problems = problemsOf(
      sample('import { isHTTPError, redact } from "@noverax/courier"\n', "page"),
      sample('import { redact } from "@noverax/courier"\n', "page", {
        line: 20,
        root: "a page's redact",
      }),
      sample('import { redact } from "@noverax/courier/server"\n', "page", { line: 30 }),
    );

    expect(problems).toEqual([
      `p.mdx:10 a page's sample imports "@noverax/courier": "@noverax/courier/client" does not give redact, which a server's code takes from "@noverax/courier/server" and a page's from the root, with its reason in root="…"; the rest from "@noverax/courier/client"`,
      `p.mdx:30 a page's sample imports "@noverax/courier/server": "@noverax/courier/client" does not give redact, which a server's code takes from "@noverax/courier/server" and a page's from the root, with its reason in root="…"`,
    ]);
  });

  it("is refused a server's name from any entry, with a reason beside the root too", () => {
    const reason = "a page takes it from the root";
    const problems = problemsOf(
      sample('import { createHandler } from "@noverax/courier"\n', "page", { root: reason }),
      sample('import { registerSources } from "@noverax/courier"\n', "page", { line: 20 }),
      sample('import { getSources } from "@noverax/courier/server"\n', "page", { line: 30 }),
      sample('import { redact, setAppOrigin, ensureCsrfToken } from "@noverax/courier"\n', "page", {
        line: 40,
        root: reason,
      }),
    );

    expect(problems).toEqual([
      `p.mdx:10 a page's sample imports "@noverax/courier": createHandler is the server's, from "@noverax/courier/server" — make the sample side="server", or leave it to a server's sample`,
      `p.mdx:20 a page's sample imports "@noverax/courier": registerSources is the server's, from "@noverax/courier/server" — make the sample side="server", or leave it to a server's sample`,
      `p.mdx:30 a page's sample imports "@noverax/courier/server": getSources is the server's, from "@noverax/courier/server" — make the sample side="server", or leave it to a server's sample`,
      `p.mdx:40 a page's sample imports "@noverax/courier": setAppOrigin, ensureCsrfToken are the server's, from "@noverax/courier/server" — make the sample side="server", or leave them to a server's sample`,
    ]);
  });

  it("is refused a dynamic import of the root, and an export from it", () => {
    const problems = problemsOf(
      sample('const { createCaller } = await import("@noverax/courier")\n', "page"),
      sample('export { isHTTPError } from "@noverax/courier"\n', "page", { line: 30 }),
    );

    expect(problems).toHaveLength(2);
  });
});

describe("a server's sample", () => {
  it("takes Courier's names from /server, and is refused the root and /client", () => {
    const problems = problemsOf(
      sample('import { registerSources } from "@noverax/courier/server"\n', "server"),
      sample('import { registerSources } from "@noverax/courier"\n', "server", { line: 20 }),
      sample('import { createCaller } from "@noverax/courier/client"\n', "server", { line: 30 }),
    );

    expect(problems).toEqual([
      expect.stringMatching(
        /^p\.mdx:20 a server's sample imports "@noverax\/courier": .*"@noverax\/courier\/server"/,
      ),
      expect.stringMatching(/^p\.mdx:30 a server's sample imports "@noverax\/courier\/client": /),
    ]);
  });
});

describe("a sample both sides load", () => {
  it("is told where a name the root alone gives a page comes from, as a page's sample is", () => {
    expect(problemsOf(sample('import { redact } from "@noverax/courier"\n', "both"))).toEqual([
      `p.mdx:10 a sample both sides load imports "@noverax/courier": "@noverax/courier/client" does not give redact, which a server's code takes from "@noverax/courier/server" and a page's from the root, with its reason in root="…"`,
    ]);
  });

  it("is refused a server's name, with a reason beside the root too, as a page's sample is", () => {
    expect(
      problemsOf(
        sample('import { createHandler } from "@noverax/courier"\n', "both", {
          root: "the handler beside the module's caller",
        }),
      ),
    ).toEqual([
      `p.mdx:10 a sample both sides load imports "@noverax/courier": createHandler is the server's, from "@noverax/courier/server" — make the sample side="server", or leave it to a server's sample`,
    ]);
  });

  it("takes Courier's names from /client, and the root's createCaller only with its reason", () => {
    const reason = "the module both sides load, whose server's caller a page never runs";
    expect(
      problemsOf(
        sample('import { isHTTPError } from "@noverax/courier/client"\n', "both"),
        sample('import { createCaller } from "@noverax/courier"\n', "both", {
          line: 20,
          root: reason,
        }),
      ),
    ).toEqual([]);
  });

  it("is refused the root's createCaller without a reason beside it", () => {
    expect(problemsOf(sample('import { createCaller } from "@noverax/courier"\n', "both"))).toEqual(
      [
        expect.stringMatching(
          /^p\.mdx:10 a sample both sides load imports "@noverax\/courier": .*root="…".*split the module/,
        ),
      ],
    );
  });

  it("is refused any other name from the root, and /server", () => {
    const problems = problemsOf(
      sample('import { createCaller, isHTTPError } from "@noverax/courier"\n', "both"),
      sample('import { isHTTPError } from "@noverax/courier/server"\n', "both", { line: 20 }),
    );

    expect(problems).toEqual([
      expect.stringMatching(
        /^p\.mdx:10 a sample both sides load imports "@noverax\/courier": .*createCaller/,
      ),
      expect.stringMatching(
        /^p\.mdx:20 a sample both sides load imports "@noverax\/courier\/server": /,
      ),
    ]);
  });
});

describe("the names a page takes from the root alone", () => {
  const fromRoot = (name, side, line) =>
    sample(`import { ${name} } from "@noverax/courier"\n`, side, { line, root: "its reason" });

  it("are entry-exports.json's, each taken from the root, with its reason, by code a page loads", () => {
    expect(ROOT_ONLY.length).toBeGreaterThan(0);
    expect(
      problemsOf(
        ...ROOT_ONLY.flatMap((name, at) => [
          fromRoot(name, "page", 2 * at),
          fromRoot(name, "both", 2 * at + 1),
        ]),
      ),
    ).toEqual([]);
  });

  it("are no other value /client leaves out: each of those is the server's, and refused there", () => {
    expect(SERVERS.length).toBeGreaterThan(0);
    const problems = problemsOf(
      ...SERVERS.flatMap((name, at) => [
        fromRoot(name, "page", 2 * at),
        fromRoot(name, "both", 2 * at + 1),
      ]),
    );

    expect(problems).toEqual(
      SERVERS.flatMap((name, at) =>
        [2 * at, 2 * at + 1].map((line) =>
          expect.stringMatching(new RegExp(`^p\\.mdx:${line} .*: ${name} is the server's, `)),
        ),
      ),
    );
  });
});

describe("types", () => {
  it("come from /client or /server, whichever has them, on any side or none", () => {
    expect(
      problemsOf(
        sample('import type { InferClient } from "@noverax/courier/client"\n', undefined),
        sample('import { type IncomingRequest } from "@noverax/courier/server"\n', "page", {
          line: 20,
        }),
      ),
    ).toEqual([]);
  });

  it("never from the root", () => {
    expect(
      problemsOf(sample('import type { InferClient } from "@noverax/courier"\n', undefined)),
    ).toEqual([
      expect.stringMatching(/^p\.mdx:10 a sample takes types from "@noverax\/courier": /),
    ]);
  });
});

describe("a sample's side", () => {
  it("is asked of a sample that imports Courier's names, and named when it is none of the three", () => {
    const problems = problemsOf(
      sample('import { createProxyCaller } from "@noverax/courier/client"\n', undefined),
      sample('import { createProxyCaller } from "@noverax/courier/client"\n', "browser", {
        line: 20,
      }),
    );

    expect(problems).toEqual([
      expect.stringMatching(/^p\.mdx:10 .*side="page", side="server" or side="both"/),
      expect.stringMatching(/^p\.mdx:20 side="browser" names no side/),
    ]);
  });

  it("is not asked of a sample that imports nothing of the core's entries", () => {
    expect(
      problemsOf(
        sample(
          'import { courier } from "@noverax/courier/define"\nimport { q } from "@noverax/courier-react"\n',
          undefined,
        ),
      ),
    ).toEqual([]);
  });

  it("reports a tab written on one line at that line", () => {
    const problems = problemsOf(
      sample('// server.ts\nimport { registerSources } from "@noverax/courier"\n', "server", {
        flat: true,
      }),
    );

    expect(problems).toEqual([expect.stringMatching(/^p\.mdx:10 /)]);
  });

  it("lets a sample that shows the root on purpose import it, when it says why", () => {
    const listing = 'import { createHandler, smoothProgress } from "@noverax/courier"\n';

    expect(
      problemsOf(sample(listing, undefined, { root: "the root's exports, both entries' names" })),
    ).toEqual([]);
    expect(problemsOf(sample(listing, undefined, { root: "" }))).toEqual([
      expect.stringMatching(/^p\.mdx:10 root="" says no reason/),
    ]);
  });
});
