# @noverax/courier-docs

Courier's documentation for the version your project installs, as Markdown the agent in your editor reads from `node_modules` — with no network, and nothing older from memory.

```bash
npm install --save-dev @noverax/courier-docs
```

It is released with every other Courier package, at the same version: updating Courier updates the docs.

## What it holds

Every page of [courier.noverax.cloud/docs](https://courier.noverax.cloud/docs/introduction), as the site serves it at the page's address with `.md` after it, in `docs/`, one file a page where the site has them — `docs/core-concepts/caller.md` is `/docs/core-concepts/caller`:

| File | What it holds |
| --- | --- |
| `docs/index.md` | Every page by section, with a link to its file and what it covers |
| `docs/<page>.md` | A page, its title and description on top, its code as written |
| `docs/manifest.json` | The version the docs are for, and each page's title, section and address, with its headings, their anchors and lines |

## Point your agent at it

Add to `AGENTS.md`, at your project's root:

```markdown
Before writing code that uses an `@noverax/*` package, read the relevant page in `node_modules/@noverax/courier-docs/docs/`: `index.md` lists them all, and they match the installed version.
```

See [Docs for Your Agent](https://courier.noverax.cloud/docs/agents/docs).

## License

MIT
