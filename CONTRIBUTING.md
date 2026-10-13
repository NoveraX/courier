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
```

Four of them are easy to skip by accident and worth understanding:

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

## Tests

Tests mirror their source: `src/foo.ts` → `tests/foo.test.ts`. Name them for
the behaviour they pin (`"returns null when the body is empty"`), mock at
boundaries rather than internals, and keep the assertions visible in the test
rather than hidden in a helper.

A bug fix should come with the test that would have caught it.

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
will get: the title, or the subject of its only commit, followed by
`(#<number>)`.

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
tagged, the release checks that its npm token is accepted.

Work that changes no package — the scopes `docs`, `site`, `landing`,
`examples`, `scripts` and `release` — releases nothing whatever its type, and
the release notes leave it out. A commit that also names a package's scope,
such as `fix(docs,core)`, counts as the package's. A release that deserves
more than a list of its commits, the first or a major one, has its notes
written in `.github/release-notes/v<version>.md`; the release takes them in
place of the list, under the same heading, for the GitHub release, the
changelog and the release commit.

A push to `master` only checks. A release is cut by running the CI workflow
by hand on `master` (Actions → CI → Run workflow): every check runs, then the
release job waits for approval in the `release` environment, which holds the
npm and Open VSX tokens and the Marketplace publisher's identity. It publishes
every package to npm, and the editor extensions, at the same version, to the
Visual Studio Marketplace and Open VSX, each the environment gives it a way in
to. The Extensions workflow publishes the extensions by hand at a version
already released.

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
