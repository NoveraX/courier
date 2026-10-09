# Courier for VS Code

Courier Studio in your editor. Above each call to an endpoint, how that endpoint's calls went in the Studio running for your project — how many, how many failed, how many are still in flight, and how long nineteen in twenty took. A click on the line opens the endpoint in Studio.

```ts
// orders.place · 34 calls · 1 failed · p95 210 ms
await api.orders.place({ sku, quantity })
```

Hover over the call for the rest: the median and the 95th percentile, the statuses the calls ended with, and the latest failure with its reason.

## How it works

Start Courier Studio for your project, as you always do:

```bash
npx courier-studio
```

Studio writes where it runs to `.courier/studio.json` in your project, and the extension reads it — for a monorepo, each project's own Studio, the one nearest the file you are in. Studio finds the calls in the file as it stands in the editor, saved or not, the same way it finds them for **Called from** in its inspector: a member chain that ends with an endpoint's name, `api.orders.place()`, and a query hook that names one, `q.orders.useQuery("list")`, in TypeScript, JavaScript, and the scripts of Vue, Svelte and Astro components.

Everything stays on your machine: the extension talks only to Studio on `localhost`, and reads what any page of Studio's reads, without its token.

## Settings

| Setting | What it does |
| --- | --- |
| `courier.hints.enabled` | Show the hints above endpoint calls (default: on) |
| `courier.hints.refreshSeconds` | How often the figures are brought up to date while the window has focus (default: 5) |
| `courier.studio.url` | Studio's address, when it runs for a project outside this workspace |

## Commands

- **Courier: Open in Courier Studio** — open Studio for the project of the file in front
- **Courier: Refresh Endpoint Hints** — find the calls again and bring the figures up to date

From Studio the other way round: each call site in **Called from** opens in your editor; choose which in Studio's Settings → Editor.

[Documentation](https://courier.noverax.cloud/docs/studio/editor)
