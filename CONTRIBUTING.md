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
npx biome check packages/
npx tsc --noEmit
npx turbo run typecheck --filter=@noverax/courier-studio-ui
npm test
npm run check:exports
```

Two of them are easy to skip by accident and worth understanding:

- `npx tsc --noEmit` typechecks the **whole workspace as one program**, tests
  included. A per-package `typecheck` can pass while this fails, because the
  root program sees global type augmentations from packages the smaller one
  never loads.
- `npm run check:exports` is the only check that reads the declarations the
  packages actually publish. Everything else resolves siblings through source.

## Working in the code

- **File size**: aim for 120–150 lines. Split by responsibility, not by line
  count. JSDoc and test files do not count toward it.
- **Types**: strict mode, no `any` — use `unknown` and narrow. Explicit return
  types on exported functions. No enums; use `as const` objects or unions.
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
English. Put the *what* and *why* in the body; the *how* is the diff. One
logical change per commit.

Breaking changes take a `!` after the type or scope, and a
`BREAKING CHANGE:` footer explaining what a user has to do:

```
feat(instance)!: ✨ remove Pages Router support

BREAKING CHANGE: GetServerSidePropsContext, NextApiRequest and
NextApiResponse types are gone; use the App Router entry points.
```

Releases are cut by semantic-release from these messages, so the type decides
the version bump.

## Pull requests

Describe what changes for a user of the library, not only what moved in the
code. If it fixes a reported issue, link it. If it changes public API, say so
explicitly — the export surface is checked.

## Reporting a security issue

Do not open an issue. See [SECURITY.md](SECURITY.md).
