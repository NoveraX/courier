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

Add Courier's block to `AGENTS.md`, at your project's root: [Docs for Your Agent](https://courier.noverax.cloud/docs/agents/docs#point-your-agent-at-them) has it as it stands, and Studio brings it up to date as it starts.

## Or serve it over MCP

An agent that works through tools rather than files can search and read the same docs through an MCP server the package runs over stdio, with no network:

```bash
claude mcp add courier-docs --scope project -- npx @noverax/courier-docs mcp
```

Its tools: `docs_search` finds the parts of the docs that answer a question, `docs_read` reads a page or the part of it under one heading, and `docs_list` lists every page by section.

See [Docs for Your Agent](https://courier.noverax.cloud/docs/agents/docs).

## License

MIT
