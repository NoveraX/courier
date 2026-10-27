# Contributing

Thanks for taking the time. This is a monorepo of one core package and its
framework adapters; everything below is what the CI will check, so running it
locally first saves a round trip.

## Getting set up

Node 22 or newer, and npm.

```bash
npm ci
npm run build
```

The build comes first on purpose: lint, typecheck and tests all resolve
sibling packages through their published entry points, which only exist once
`lib/` has been produced.

## The checks

Run these before opening a pull request. They are the same commands CI runs,
in the same order.

```bash
npm run build
npx biome check .
npm run check:names
npx tsc --noEmit
npx turbo run typecheck --filter=@noverax/courier-studio-ui
npm run check:any
npm run test:coverage
npm run check:exports
npm run check:docs
npm run check:packages
npm run check:publish
npm run check:browser
npm run check:page-dates
```

Six of them are easy to skip by accident and worth understanding:

- `npx tsc --noEmit` typechecks the **whole workspace as one program**, tests
  included. A per-package `typecheck` can pass while this fails, because the
  root program sees global type augmentations from packages the smaller one
  never loads.
- `npm run check:exports` is the only check that reads the declarations the
  packages actually publish. Everything else resolves siblings through source.
- `npm run check:docs` compiles every TypeScript sample of the docs and the
  READMEs against the built packages. A sample may leave out the reader's own
  code; what it takes from the packages has to compile, so a changed
  signature fails here until the pages that show it change too.
- `npm run check:publish` lints each package as `npm pack` would ship it:
  publint reads the manifest against the packed files, and attw resolves
  every export's JavaScript and types as Node and bundlers do. Any message
  fails it, a suggestion included.
- `npm run check:browser` builds what a page takes from Courier — the
  definitions, a direct caller, a proxy caller, React Query hooks — as an
  app's bundler builds it for production. It fails when a page reaches a
  built-in module of Node, when what loads at start grows past its budget,
  and when a module calls a browser API newer than the requirements name
  (Safari 15.4, Chrome 97, Firefox 104), or one a page served over plain
  HTTP lacks, without checking for it first. A change that earns more bytes
  raises the budget in `scripts/browser-bundles/scenarios.mjs`, saying why
  in its commit. It fails too when a page takes a core module only a
  server runs, or Node, an edge runtime or React Native takes its browser
  stand-in (below).
- `npm run check:page-dates` asks every docs page whose text your branch
  changed for its date: the `updated` field of the page's metadata, which
  the site shows on the page and hands to search engines, must be no older
  than the day you changed the text. A change to the date alone, or to a
  page's spacing, needs none. `npm run check:page-dates -- --fix` writes
  today's date into each page that needs it.

## Working in the code

- **File size**: aim for 120–150 lines. Split by responsibility, not by line
  count. JSDoc and test files do not count toward it.
- **Types**: strict mode, no `any` — use `unknown` and narrow. A value some
  declaration types `any` — what `JSON.parse` or `Reflect.get` returns, a
  promise's rejection reason — is read into `unknown` where it arrives;
  `npm run check:any` reports one that is not. Explicit return types on
  exported functions. No enums; use `as const` objects or unions.
- **Naming**: `kebab-case.ts` files, `camelCase` values, `PascalCase` types,
  `UPPER_SNAKE_CASE` constants. Generics get real names (`TResponse`), not
  single letters.
- **Exports**: named only, one primary export per file, and the file is named
  after it. Barrels re-export explicitly — no `export * from`.
- **Imports**: no `.js` extensions on relative imports; `import type` at the
  top of the file rather than inline `import()` types.
- **Errors**: validate at system boundaries, not between trusted internals.
  Never swallow an error silently — log it or rethrow it.
- **Comments**: explain why, not what. Delete commented-out code; git has it.
- **Code only a server runs**: a core module a page never needs but would
  still bundle — the terminal logger, the addresses a request came through —
  is listed in `packages/core/tsdown.server-only.ts`, and a stand-in of the
  same path and exports sits under `packages/core/src/browser/`. The build
  imports the module through `#courier-server/…`, which the package's
  `imports` field resolves to the stand-in for a bundler building a page,
  and to the module itself for Node, an edge runtime and React Native. The
  prefix is the package's own: Nuxt sends a bare `#server/…` to the
  application's `server/` directory, a package's imports included.

## Tests

Tests mirror their source: `src/foo.ts` → `tests/foo.test.ts`. Name them for
the behaviour they pin (`"returns null when the body is empty"`), mock at
boundaries rather than internals, and keep the assertions visible in the test
rather than hidden in a helper.

A bug fix should come with the test that would have caught it.

A test holds on a slow machine as it does on a fast one: CI's runners are
busy, and the Windows runner slower still.

- It waits for what it checks — a promise, an event, `expect.poll` — never
  for a length of time before checking.
- A server listens on port 0 and is called at the address it reports: a port
  found free and let go can be taken before the server listens on it.
- A bound on how long something took sits far below what the wrong
  behaviour would take — half of it — not just above what the right one
  takes.
- A hook that starts Studio has as long as a test: Studio's project gives
  both 30 seconds.
- Temporary files go in `os.tmpdir()`. On the Windows runner CI puts it on
  the runner's own drive: the system drive is a network disk whose writes
  stall for seconds once the suite has used up its allowance.

CI runs a test once. One that fails now and then is a bug in the test or in
the code it tests, and its cause is found rather than retried away.

A test that cannot run on a platform — a behaviour only another platform
has, a service the run has none of — skips itself by a condition, and CI
holds each run's skipped tests to `scripts/skipped-tests.json`: a test the
list does not name for that platform, if skipped, or one it names, if run,
fails the job. A new skip goes in the list with the change that makes it;
the job's summary lists every test it skipped. The lists are the CI
runners', so a machine with Redis running skips none of the Redis tests the
macOS list names.

Studio's flows also run in a real browser: `e2e/` starts Studio from its
command line over a copy of a fixture project, and drives importing,
updating and removing an API, the mock wizard and the mocks, and the
Playground as a developer does. It runs on the built packages, in Chromium,
WebKit and Firefox:

```bash
npm run build
npx playwright install chromium webkit firefox
npm run test:e2e
```

The VS Code extension runs inside VS Code itself, Courier File Icons beside
it as Courier's extension pack installs it: a stand-in Studio answers as the
real one does, and a suite opens a project's file and reads the hints the
editor shows over its calls, and checks that Courier File Icons runs where
the editor's window runs. It runs the VS Code at `VSCODE_PATH`; or
the version `VSCODE_VERSION` names — `stable`, a version number, or
`minimum`, the oldest the extension's `engines` field takes — downloaded for
the run; or else the one installed on a Mac, or the latest stable. CI runs
both `minimum` and `stable`, under a virtual display:

```bash
npm run build
npm run test:editor -w courier-vscode
VSCODE_VERSION=minimum npm run test:editor -w courier-vscode
```

The user's session is checked in a browser as well, in an application built
with each framework version Courier supports: Next.js 14, 15 and 16 (16 also
with `cacheComponents`), SvelteKit 2.19 and the newest 2.x, Nuxt 3 and 4,
Express 4 and 5, Fastify 4 and 5, Hono 4, Astro 5, React Router 7 and 8,
Remix 2, SolidStart 1 and 2, NestJS 10, 11 and 12 (10 and 12 on Fastify too),
and a React single-page application. Each version
`e2e/frameworks/targets.json` lists is installed from npm, in the system's
temporary folder, beside the packages packed as the registry would ship
them; then the application is built, served and driven in Chromium, WebKit
and Firefox against an API that records every request it receives:

```bash
npm run build
npx playwright install chromium webkit firefox
npm run test:frameworks
npm run test:frameworks -- next-15 nuxt-4
```

`COURIER_BROWSERS` picks the engines either check runs in, such as
`COURIER_BROWSERS=chromium,webkit`.

CI runs one job for each version on every push and pull request, and again
every week: a version is a range that resolves to its newest release, so a
framework's new release is checked even when nothing here changes. A version
Courier starts to support goes into `targets.json`.

## Commits

Conventional Commits, with an emoji after the colon:

```
<type>(<scope>): <emoji> <description>
```

| type | emoji | | type | emoji |
|---|---|---|---|---|
| `feat` | ✨ | | `test` | ✅ |
| `fix` | 🐛 | | `build` | 📦 |
| `docs` | 📝 | | `ci` | 👷 |
| `style` | 🎨 | | `chore` | 🔧 |
| `refactor` | ♻️ | | `perf` | ⚡ |

Subject line in the imperative, 72 characters at most, no trailing period,
English, with the description after the emoji in lower case. Put the *what*
and *why* in the body; the *how* is the diff. One logical change per commit.

Do not start a body line with a token followed by `: ` or ` #` (`Core: …`,
`Issue #12 …`). That is how the Conventional Commits grammar opens the
footer, and a parser that follows it, commitlint's among them, ends the body
there. The lines meant as footers may stand anywhere: a `BREAKING CHANGE:`
note in capitals, an issue reference (`Closes #12`, `Refs: #12`), and the git
trailers `Co-authored-by`, `Co-developed-by`, `Signed-off-by`, `Reviewed-by`,
`Acked-by`, `Tested-by`, `Reported-by`, `Suggested-by`, `Helped-by`,
`Change-Id` and `Link`.

The commit-msg hook checks the type and its emoji, the length, the case of
the description, the trailing period and the footer rule. CI checks the same
on a pull request's commits, and on master on every commit since the last
release; it also refuses `fixup!`, `squash!` and `amend!` commits that were
never folded in. A pull request is checked for the header its squash merge
will get: the title followed by `(#<number>)`, and the subject of its only
commit the same way when the repository takes a squash merge's header from
the commit.

Breaking changes take a `!` after the type or scope, and a
`BREAKING CHANGE:` footer explaining what a user has to do:

```
feat(instance)!: ✨ remove Pages Router support

BREAKING CHANGE: GetServerSidePropsContext, NextApiRequest and
NextApiResponse types are gone; use the App Router entry points.
```

Releases are cut by semantic-release from these messages, so the type decides
the version bump: `fix` and `perf` release a patch, `feat` a minor version.
While the packages are below 1.0, a breaking change — a `!` or a
`BREAKING CHANGE:` footer — releases a minor version too; the release rule
that says so in `.releaserc.json` is removed to cut 1.0. Before anything is
tagged, the release checks that npm will take every package from it
(`scripts/check-npm-publishing.ts`).

Work that changes no package — the scopes `docs`, `site`, `landing`,
`examples`, `scripts` and `release` — releases nothing whatever its type, and
the release notes leave it out. A commit that also names a package's scope,
such as `fix(docs,core)`, counts as the package's. A release that deserves
more than a list of its commits, the first or a major one, has its notes
written in `.github/release-notes/v<version>.md`; the release takes them in
place of the list, under the same heading, for the GitHub release, the
changelog and the release commit.

A push to `master` runs every CI job once, and the run's last job is the
release, cut by hand. Once every other job of the run has passed, the release
job waits for approval in the `release` environment: on the run's page,
Review deployments, then Approve and deploy. A run with a job that failed has
no release to approve; Re-run failed jobs runs those jobs again and, once
they pass, brings the release job back with them. A newer push to `master`
cancels the older runs that have not started releasing, and the release
refuses a commit that is no longer the newest on `master`. The environment
holds the Open VSX token and the Marketplace publisher's identity.
The release publishes every package to npm, and the editor extensions, at
the same version, to the Visual Studio Marketplace and Open VSX, each the
environment gives it a way in to. The Extensions workflow publishes the
extensions by hand at a version already released.

The Marketplace publisher's identity is a user-assigned managed identity in
Microsoft Entra ID; an app registration signs in, but the Marketplace refuses
it when it publishes. The identity needs no role in its subscription. Its
federated credential trusts the `release` environment of this repository,
whose GitHub tokens name the owner and the repository by their ids too:
issuer `https://token.actions.githubusercontent.com`, subject
`repo:NoveraX@266351334/courier@1175462942:environment:release` (the prefix
before `:environment` is `sub_claim_prefix` in
`gh api repos/NoveraX/courier/actions/oidc/customization/sub`). The
environment holds the identity's client and tenant IDs as the variables
`AZURE_CLIENT_ID` and `AZURE_TENANT_ID`. Run the Extensions workflow once with
`identify`: it prints the id the Marketplace knows the identity by, which is
added in the publisher's Members with the Contributor role.

Until the Marketplace has a way in, a release publishes the extensions to
Open VSX alone and keeps both packages as the run's `editor-extensions`
artifact. They are uploaded by hand on the publisher's page at
marketplace.visualstudio.com/manage, Courier File Icons first, since Courier
installs it.

npm takes the packages through trusted publishing, with no token: each
package names this repository's `ci.yml` and its `release` environment as
its trusted publisher, and npm exchanges the release job's own short-lived
identity for the right to publish it, with provenance. A package is set up
once by a maintainer signed in to npm, who also has it refuse tokens
altogether, so a token that leaks publishes nothing:

```bash
npm trust github @noverax/courier --file ci.yml --repo NoveraX/courier --env release --allow-publish
npm access set mfa=publish @noverax/courier
```

`npm trust list @noverax/courier` shows what a package trusts. Before it tags
anything, the release asks npm, for every package, to make that exchange.
The `release` environment holds no npm token to fall back on, so a package
npm will not let the run publish stops the release there, and the run names
the command that sets it up. npm sets up only a package it already has: a
new package's first version is published by hand, by a maintainer signed in
to npm, and the package is set up after it.

The packages are published by `scripts/release.ts` with the npm that comes
with Node, never by semantic-release's own npm plugin, which `.releaserc.json`
leaves out of its plugins. semantic-release installs that plugin all the same,
and with it a copy of the npm CLI with old dependencies bundled inside;
`scripts/stubs/semantic-release-npm` stands in for the plugin, through the
`overrides` in `package.json`, so neither is installed. A release that names
no plugins of its own would load the stand-in, which stops it.

## Pull requests

Describe what changes for a user of the library, not only what moved in the
code. If it fixes a reported issue, link it. If it changes public API, say so
explicitly — the export surface is checked.

The title becomes the squash-merge commit's header, so it follows the commit
convention too, and CI checks it. Dependabot titles its pull requests in the
convention itself — `fix(deps): 🐛 bump zod from 4.6.5 to 4.7.0` — as
`.github/dependabot.yml` tells it to.

## Reporting a security issue

Do not open an issue. See [SECURITY.md](SECURITY.md).
