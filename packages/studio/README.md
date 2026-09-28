<div align="center">
  <br />

  # @noverax/courier-studio

  **Visual debugging studio for Courier — inspect requests, explore endpoints, and monitor your API in real time.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-studio"><img src="https://img.shields.io/npm/v/@noverax/courier-studio?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Overview

Courier Studio is a development server with a web UI: a request inspector, an endpoint explorer, an API playground, mock servers, and more. You run it next to your app, and your app connects to it — the server side through `attachRuntime()`, the browser side through one of the build integrations below.

<br />

## Install

```bash
npm install --save-dev @noverax/courier-studio
npm install @noverax/courier-studio-core
```

Studio needs Node.js 22.13 or newer. Studio is a development tool, so it is a dev dependency. `@noverax/courier-studio-core` is what your server instrumentation imports `attachRuntime()` from, so it is a dependency: a production install leaves dev dependencies out, and a server that imports the runtime does not start without it — even one that calls it only in development. `attachRuntime()` runs in production too, where it registers the config's sources. An app that only connects its browser through a build integration can leave it out.

<br />

## Start Studio

```bash
npx courier-studio
```

Studio listens on `http://localhost:6280` — at both `127.0.0.1` and `::1`, so it answers whichever one a client dials — or on the `studio.host` and `studio.port` of your `courier.config.ts`. Server runtimes and the build plugins read the same block, so moving Studio there moves them with it: a server runtime reads the nearest config at or above its working directory, and a build plugin the nearest at or above Vite's root — or, for webpack, esbuild and Rollup, the working directory. Flags: `--port`, `--host`, `--cwd` (project root), `--open` (open a browser), `--version`. Studio keeps its working files — imported API state, copies of the files it replaced or removed, saved sessions — in `.courier/`, which ignores itself in git.

What Studio shows is kept in `.courier/studio.db`, a SQLite database built into Node, with nothing to install or set up. The requests it captured are there, the latest 2000 of them, so a page that reloads, or a Studio that restarts, shows them again. A request still open when Studio stopped is shown as ended, since no runtime can say any more how it ended. The saved sessions are there too, and which one a page loaded: a page that reloads shows that session again, recording paused, until you go back to the live requests with the play button or **Back to live requests** in the command palette. So are the requests each mock answered, the latest 500, which the Mocks view's log shows again, and the Playground's history of calls — kept for the project, so another browser shows it too. Only how a page looks, its theme and layout, stays in the browser. Delete the file, with Studio stopped, to start empty. Studio creates it readable and writable by its owner only.

No credential is written there. The value of `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, and of any header whose name has a word such as `auth`, `token`, `secret`, `password`, `session`, `csrf` or `api-key` in it, is kept as `[redacted]` in the request log, the mocks' logs, saved sessions and the Playground's history, and so in a HAR or Postman export of a session. The live view, which nothing writes down, shows the values whole to a page opened from Studio's link, and redacted to any other; a request replayed after a reload carries `[redacted]` instead.

When the database cannot be kept there — `.courier` is a link, the disk is read-only, a newer Studio made it — Studio keeps its data in memory for that run, and says so. A file there that is not a database is moved aside to `studio.db.broken-<time>`, and a new one is started.

Studio loads `courier.config.ts` from the project root, with the `courier.mocks.ts` beside it, and loads them again whenever either one, or a module either imports, is saved: see [How Studio loads the project](#how-studio-loads-the-project).

A project that has no API sources yet starts with this `courier.config.ts` at its root — the APIs page offers it to copy while there is no config, and keeps **Import API** off until one loads:

```ts
import { defineConfig } from "@noverax/courier/config";
export default defineConfig({ sources: {} });
```

**Import API** then writes the project's first API into its output directory — `src/api/<source name>/` by default — where `source.ts` exports the source under its source name. Add it to `sources` under that name, and the APIs page lists it as imported:

```ts
import { defineConfig } from "@noverax/courier/config";
import { petstore } from "./src/api/petstore/source";

export default defineConfig({ sources: { petstore } });
```

Studio makes changes only for a page opened from the link it prints in its terminal, `http://localhost:6280/#token=…`. The token is the project's: Studio keeps it in `.courier/studio-token`, readable by your account alone, and prints the same one each time it starts, so a page you opened once keeps working; the page takes the token out of its address bar and keeps it for its next visits. A page or process without it still sees everything Studio shows, the credentials of live traffic redacted, but Studio refuses its every change: writing the project's files, driving the mocks, sending from the Playground, saving, loading or deleting sessions, and clearing the log. Studio answers only its own page and the apps running on this machine, so on the default `localhost` nothing else can reach it; bound to the network (`--host 0.0.0.0`), anyone on that network can see what it shows, and a change still needs the token. Its pages refuse to be shown in a frame, so another site cannot put Studio under a page of its own.

The build integrations connect your app to Studio; they do not start it.

<br />

## Connect the browser

Every integration connects only a development build, as the bundler tells one: the dev server of Vite, Astro or Nuxt, `next dev`, webpack's `mode: "development"`, an esbuild build that neither minifies nor defines `process.env.NODE_ENV` as `"production"`, and Rollup's watch mode (`rollup -c -w`). A production build — `vite build`, `webpack --mode production` or webpack with no `mode`, a minified esbuild build, a one-off `rollup -c` — is left untouched, whether or not `NODE_ENV` is set, and `NODE_ENV=production` rules out any build. Pass `{ enabled: true }` or `{ enabled: false }` to decide yourself.

| Import path | For | Register |
|---|---|---|
| `@noverax/courier-studio/vite` | Vite, and the frameworks built on it | `plugins: [courierStudio()]` |
| `@noverax/courier-studio/react`, `/vue`, `/sveltekit`, `/remix`, `/solid` | React, Vue, SvelteKit, React Router (Remix), SolidStart — the Vite plugin under a framework name | `plugins: [courierStudio()]` in `vite.config.ts` |
| `@noverax/courier-studio/astro` | Astro | `integrations: [courierStudio()]` |
| `@noverax/courier-studio/nuxt` | Nuxt, with any of its builders | `modules: [courierStudioModule]` |
| `@noverax/courier-studio/next` | Next.js under webpack | `export default withCourierStudio()(nextConfig)` |
| `@noverax/courier-studio/webpack` | webpack | `plugins: [courierStudio()]` |
| `@noverax/courier-studio/esbuild` | esbuild | `plugins: [courierStudio()]` |
| `@noverax/courier-studio/rollup` | Rollup | `plugins: [courierStudio()]` |
| `@noverax/courier-studio/angular` | Angular | `setupCourierStudio()` in `main.ts` |

```ts
// vite.config.ts
import { courierStudio } from "@noverax/courier-studio/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [courierStudio()],
})
```

### Next.js

Next.js 16 builds with Turbopack, which runs no webpack plugins. Connect the browser from `instrumentation-client.ts` (Next.js 15.3 and later, under either bundler):

```ts
// instrumentation-client.ts
import { attachRuntime } from "@noverax/courier-studio-core/runtime"

if (process.env.NODE_ENV === "development") {
  attachRuntime("next-browser")
}
```

A browser bundle cannot read `courier.config.ts`, so when Studio is not at the default address, pass it through `env: { COURIER_STUDIO_URL: "http://localhost:7000" }` in `next.config.ts`.

Under webpack — Next.js 14 and 15 by default, `next dev --webpack` since — `withCourierStudio()` connects the browser without that file. It also keeps `ws`, which the server's Studio connection runs on, out of the server bundle: bundled, `ws` fails on every frame of 48 bytes or more, and the server never reaches Studio. Without the wrapper, add `serverExternalPackages: ["ws"]` to the config. Under Turbopack it leaves your config untouched and prints the snippet above if the file is missing.

### Nuxt

Import the module rather than naming it as a string, and pass options in the tuple form:

```ts
// nuxt.config.ts
import { courierStudioModule } from "@noverax/courier-studio/nuxt"

export default defineNuxtConfig({
  modules: [courierStudioModule],
})
```

### Angular

```ts
// src/main.ts
import { setupCourierStudio } from "@noverax/courier-studio/angular"

setupCourierStudio() // or setupCourierStudio({ studioUrl: "http://localhost:7000" })

bootstrapApplication(AppComponent, appConfig)
```

<br />

## Connect the server

```ts
import { attachRuntime } from "@noverax/courier-studio-core/runtime"

await attachRuntime()
```

Call it once at startup — from `instrumentation.ts` in Next.js, a Nitro plugin in Nuxt, `hooks.server.ts` in SvelteKit, or before `listen()` in a Node server. See [`@noverax/courier-studio-core`](../studio-core/README.md).

Studio keeps the latest 2000 requests your app makes in memory, so a Studio page that opens or reloads shows the ones made before it; clearing the Timeline clears them there too, except the pinned ones when **Preserve log** is on. A request or stream still open when its app stops, or loses its connection to Studio, is shown as failed: the app can no longer say how it ended.

<br />

## Import an API

**Import API** on the APIs page turns an OpenAPI 3, Swagger 2 or Postman specification — from a URL, a file, or pasted text — into typed API code: pick the endpoints, choose the options, preview the files, then **Write to Disk**. Studio generates the files itself and writes them to the output directory, in a folder named after the source in kebab case (`src/api/pets/` for `pets`, `src/api/pet-store/` for `petStore`), where `source.ts` exports the source, and records what it wrote in `.courier/imports-state.json` — see [Which files Studio changes](#which-files-studio-changes).

Studio lists only the sources `courier.config.ts` declares — it does not look for API files in the project — and an import changes no config. So after the write the wizard shows what the config still lacks, each part ready to copy, and the API appears in Studio — on the APIs page, in the Explorer and in the Playground — once the config declares it:

```ts
// courier.config.ts
import { defineConfig } from "@noverax/courier/config"
import { api } from "./src/api"
import { pets } from "./src/api/pets/source"

export default defineConfig({
  sources: { api, pets },
  imports: {
    pets: {
      importType: "url",
      type: "openapi",
      from: "https://specs.example.com/pets.json",
      outputDir: "src/api",
      sourceName: "pets",
    },
  },
})
```

- **`sources`** is what Studio lists APIs from, and what your app calls. An API written by hand is declared there the same way. Studio matches an import to the source of its name, so an import needs a name no other source takes: while `sources` declares another API under it, Studio writes nothing and says so. The APIs page lists a source as imported only when the config loads the `source.ts` Studio generated for it.
- **`imports`** is what Studio checks and manages an import from: the update check fetches `from` again, and when the specification changed, **Manage** lists the endpoints it adds and drops, for you to add to the files or remove from them; the endpoints you add are generated with the options written there. The wizard's entry carries the source name and every option you changed from its default, but not the endpoints you left out in the Select step — the entry has no way to keep that selection — so Manage lists those as endpoints you can add, and the wizard says how many there are. A file or pasted import has no `from`: Manage asks for its specification each time, and the update check marks it not checked, rather than up to date. A check that fails says why on the import's card. The update check sends `auth` with the request to `from`'s own origin, never to a host it redirects to, and refuses a specification whose hash is not the one `pinHash` names — the hash Studio records for the import as `specHash` in `.courier/imports-state.json`. An update, Manage and a new write of a declared import generate from what its `transform` returns for the parsed specification, keeping only the endpoints `include` names, by tag, by path as the specification writes it, or by operationId, and then leaving out those `exclude` names.
- Importing the same name again keeps the endpoints you edited by hand, while the specification still describes them, and the ones you added, in the files that declare them. Every other generated file — the source of an API grouped by tag or path, its `index.ts`, the schemas — is written as generated; when it holds edits of yours, Studio asks before replacing it. A group left out this time has its files removed, as long as Studio wrote them and nobody changed them; the message after the write says how many files it removed, and their copies are kept.
- A part the config declares already is left out, and once it declares both, the wizard closes after the write and says only what it wrote.
- The generated files are application code. A project that emits declarations compiles them, since every type their exports carry is one the packages export, but not one under `isolatedDeclarations`, which asks for a written type on every export: the type of a group or a source is the whole chain of its endpoints.

### Which files Studio changes

Studio changes an import's files — when it writes the import, updates it, adds or removes endpoints, or removes the import — only inside the import's folder, and decides for each file by who it belongs to. It records every file it writes, with a hash of its content, in `.courier/imports-state.json`, and starts each with two lines that say so:

```ts
// @courier-generated {"import":"pets","sha256":"3f2a…"}
// Courier Studio wrote this file. It keeps your edits to endpoints when it updates the file.
```

- **A file Studio wrote and nobody changed** is replaced or removed as the change needs. A file whose first line names the import, but which Studio has no record of — in a fresh clone, say, where `.courier/` is not checked in — is treated the same way when it is replaced; removing one waits for you, offered ticked.
- **A file you changed** keeps your edits to endpoints when Studio updates it. A file Studio would replace whole, or remove, waits for you instead — and so does a file whose endpoints Studio cannot read as code, one saved mid-edit say, since it cannot keep your edits in it.
- **A file Studio did not write** — one you added to the folder, or one its first line says Studio wrote for another import — is never removed, and replacing it waits for you.
- **A symbolic link or a folder where a file should be** is never written through, replaced or removed, and nothing is written through a folder link that leads out of the project. A change that would write one of them is refused until you move it out of the way.

When a change holds steps that wait for you, Studio shows them with the rest of the change, each with its own checkbox, and takes only the steps you tick; a file left unticked stays as it is, and so does every file it imports: Studio never removes a file that a file staying in the import's folder imports, and the message after the change counts it among the files left as they were. An update, a change to endpoints and a removal are applied only as you previewed them: if a file changed in the meantime, Studio shows the change as it now stands instead. A write needs no preview, and asks only when a step waits for you.

Every change is applied all at once. Studio keeps a copy of each file it replaces or removes in `.courier/backups/<change>/`, and keeps the copies of the last 20 changes that made any. A change that Studio is stopped in the middle of is undone the next time it starts, file by file, except for a file changed since, which is left as it is. A change another Studio on the same project is still making is left to that Studio. Studio tries such an undo once: its copy of each file it could not restore is kept, whatever the limit, and Studio names those files at every start until you delete their folder in `.courier/backups/`. Studio undoes only what its own records name: a `.courier` folder that came with the project cannot make it touch other files. Removing an import leaves `courier.config.ts` as it is: the dialog warns when the config imports one of the files that go, since the config stops loading until you remove that import, and reminds you to remove the import's entry under `imports` too, since Studio goes on checking the import for updates while the config declares it.

A request Studio refuses changes nothing. It is answered with `{ error }` — `404` for an import Studio does not know, `400` for a body it cannot read — and, for the refusals below, with a `code` and, where there is one, the plan as it stands. A change that needs `courier.config` to load is refused as [How Studio loads the project](#how-studio-loads-the-project) describes.

| Code | Status | Meaning |
|---|---|---|
| `NEEDS_CONFIRMATION` | 409 | Some steps wait for you; send the request again with the plan's `planDigest` and the paths you allow in `confirm`. |
| `PLAN_NOT_SEEN` | 409 | An update, a change to endpoints or a removal quoted no plan; preview it first. |
| `PLAN_STALE` | 409 | The plan is not the one you saw: a file it rests on changed, or the import's declaration or the change asked for did. |
| `TARGET_BLOCKED` | 409 | A file the change writes is a symbolic link or not a file. |
| `CONFIRMATION_NOT_IN_PLAN` | 400 | `confirm` names a path the plan does not ask about. |
| `DECLARATION_MISMATCH` | 409 | `imports` declares the import in another folder, or with another type, validation, grouping, client or other generation option, than the wizard's options; the message names each one. An update and Manage generate as declared, so an import written otherwise would change layout at the next of them. |
| `DIR_OVERLAP` | 409 | Another import owns the folder, or one inside or around it. |
| `NAME_TAKEN` | 409 | `sources` declares another API under the import's name. |
| `FILE_NOT_RECOGNIZED` | 409 | A file Studio would add endpoints to no longer shows where its endpoints are. |
| `ENDPOINT_OUTSIDE_PREFIX` | 409 | An endpoint you add would call a URL the prefix its group file declares cannot reach, or Studio cannot read that prefix; add it by hand, or import the API again under the same name. An endpoint the file's prefix can reach is written relative to it, whatever prefix the specification gives the group. |
| `IMPORTS_STATE_UNSAFE` | 409 | Studio cannot read `.courier/imports-state.json`, or keep a copy of it, so saving it would lose the other imports' records. |
| `COURIER_DIR_UNSAFE` | 409 | `.courier`, or a folder Studio keeps in it, is a symbolic link or not a folder; Studio keeps nothing there. |
| `INVALID_IMPORT` | 400 | The output directory, the source name or a group's name is one Studio does not write to: outside the project, in `.git`, `node_modules` or `.courier`, or a name Windows treats differently. |
| `PATH_OUTSIDE_PROJECT` | 400 | A path leads out of the project. |
| `SPEC_NOT_GENERATED` | 400 | Studio could not generate code from the specification sent. |
| `SPEC_TOO_LARGE` | 413 | The specification is larger than 64 MB once parsed: Studio takes the parsed specification back when it generates, writes, updates or manages an import, and a request body may be at most 64 MB. |
| `SPEC_UNREADABLE` | 502 | The import's `from` answered with something that is not a specification Studio reads, such as a page. |
| `SPEC_PIN_MISMATCH` | 409 | The specification's hash is not the one the import's `pinHash` names. |
| `IMPORT_TRANSFORM_FAILED` | 400 | The import's `transform` threw, or returned something that is not a specification. |

<br />

## Mock servers

Studio runs the mock servers declared in `courier.mocks.ts`, beside `courier.config.ts`. `defineMocks` and `defineMockServer` come from [`@noverax/courier-mock`](../mock/README.md), a development dependency installed with the server it runs on:

```bash
npm install --save-dev @noverax/courier-mock hono @hono/node-server
```

```ts
// courier.mocks.ts
import { defineMocks, defineMockServer } from "@noverax/courier-mock"
import courierConfig from "./courier.config"

export default defineMocks({
  apiMock: defineMockServer({
    source: courierConfig.sources.api,
    port: 7010,
    seed: { count: 50 },
    autoStart: true,
  }),
})
```

Each key names a mock in Studio, and `source` is the source it serves, here read from the config. `port`, `seed` (20 records per collection unless set) and `autoStart` (off unless set) are optional, as are overrides, scenarios and the rest the mock package's README describes.

In a `"type": "module"` package whose tsconfig resolves modules as Node does (`node16` or `nodenext`), import `./courier.config.js` instead: TypeScript asks for the extension there, and both TypeScript and Studio map `./courier.config.js` to `courier.config.ts`.

Reading the source from the config, as above and as Studio's wizard writes it, needs a config whose default export is `defineConfig({ sources })`. A config that exports `sources` by name only, as the standalone server also accepts, loads in Studio, but a default import of it does not type-check; import the source from where that config does instead.

The mocks have a file of their own because `courier.config.ts` is also loaded in production — by the standalone server, and by `attachRuntime()` — where the mock package is not installed. Only Studio reads `courier.mocks.ts`. `courier.config.ts` has no `mocks` key: `defineConfig` does not type-check with one, and Studio reads mocks from nowhere else.

- **File names.** Studio looks in the project root for `courier.mocks.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs`, in that order, and loads the first it finds. A TypeScript file loads as it is, with extensionless imports and tsconfig path aliases. Studio loads it together with the config, as one module graph, so a module both import runs once and a mock holds the very source object the config declares.
- **A mocks file that does not load** — a syntax error, an import that cannot be resolved, no default export — leaves the config and its sources working, and the mocks keep serving the definitions that loaded last. Studio's terminal logs why, and a banner above the Mocks view says so until the file loads again.
- **Workers.** Each running mock is a process of its own that Studio starts. It loads `courier.mocks.ts` with Studio's loader, reusing the transforms Studio keeps (see [How Studio loads the project](#how-studio-loads-the-project)), and serves that one mock; its request log and whatever it prints reach Studio's terminal. Saving the mocks file, or a module it imports, restarts a running mock whose declaration — or something the declaration uses — changed; the other mocks keep running with their records.
- **Ports.** A `port` is held exactly: while another process holds it, the mock does not start, and Studio says why. A mock without one is assigned a port from `studio.mockBasePort` (7001 unless set): the next one up that no other mock has been assigned or declares. Studio only counts up, so a port a removed mock had is not assigned again. The assigned port stays with the key across the mock's restarts and edits of the files, with two exceptions: when another process holds it as the mock starts, the mock listens on the next free port above it, and when a mock declares that port, the key is assigned another. After Studio restarts, ports are assigned afresh, so the mock can get another. Set `port` to keep one. `courier-studio` reads `studio.mockBasePort` when it starts; [`createStudioServer()`](#programmatic) takes its `mockBasePort` option instead.

### Add mocks from Studio

**Add mock server** in the Mocks view opens a wizard: pick the sources to mock, set each mock's key, its port — assigned by Studio or fixed — its records per collection and whether it starts with Studio, then review. Studio shows the exact change to `courier.mocks.ts` as a diff, with what the diff does not show — that it creates the file, which running mocks it restarts, that a port is taken or assigned — and writes it on one click. It creates `courier.mocks.ts` when there is none (`courier.mocks.mts` beside a `courier.config.mts`), and changes an existing file only by inserting text: the new entries in the object `defineMocks` takes, and the imports they need. It imports a `courier.config.ts` the way the project resolves modules: as `./courier.config.js` when the tsconfig, or a project it lists under `references`, resolves them as Node does (`node16` or `nodenext`) in a `"type": "module"` package, or when the config's or the mocks file's own relative imports end in `.js` or `.mjs`, and as `./courier.config` otherwise. A key another mock has, in any letter case, a port that is Studio's own or that another mock declares, or a source the config does not declare is marked on its field instead. A port Studio assigned to another mock may be taken: the review warns that the other mock moves to another port. **Add mock server** is turned off, and says why, while Studio's first load of `courier.config` runs, while the config does not load, and while it is missing. During a later reload it stays on: the wizard waits for the reload before it plans the change, and answers `STUDIO_BUSY` when the reload outlasts that wait.

Studio then loads the edited files and runs them only if they are the edit it meant: the mocks file loads, each new mock is a `defineMockServer()` definition serving the config's source, no mock declared before is gone, and the config's sources are unchanged. Otherwise it puts the file back, or removes the file it created, keeps running what it ran, and shows why, with the lines to add by hand once the cause is fixed. If the file was saved in the meantime, Studio keeps that save, and lists the lines it added for you to remove; so it does when it cannot put the file back. A save between the review and the click is caught too: Studio shows the change again, planned against the file as it stands.

When Studio will not edit the file itself, it shows the lines to add by hand — or the whole file to create — with the reason. For the first five reasons below, the wizard plans the change again by itself when the project changes, or on **Check again**.

| Code | Studio says |
|---|---|
| `STUDIO_STARTING` | Studio is still loading courier.config; try again in a moment. |
| `STUDIO_BUSY` | Studio is still loading courier.config; try again in a moment. On the click, once it has waited 5 s longer than one load may take: Studio is still loading courier.config after *25 s*, so it did not change anything. Try again once it has loaded. |
| `CONFIG_LOAD_FAILING` | courier.config does not load right now (*error*). Fix that first; Studio adds mocks only beside a config it can load. |
| `MOCKS_LOAD_FAILING` | *courier.mocks.ts* does not load right now (*error*). Fix that first. |
| `MOCKS_CHANGED_SINCE_LOAD` | *courier.mocks.ts* changed since Studio loaded it. Studio plans the edit once it has reloaded. |
| `NO_CONFIG` | There is no courier.config in the project. Declare your sources there first. |
| `CONFIG_SHADOWED` | *courier.config.js* sits beside *courier.config.ts*, so the import of "*./courier.config*" in *courier.mocks.ts* would load *courier.config.js*, not *courier.config.ts*, which Studio loads. Delete or move *courier.config.js* — most likely compiled output — then ask again. |
| `MOCKS_JAVASCRIPT` | *courier.mocks.js* is JavaScript. Studio writes ES imports named as TypeScript resolves them, which a CommonJS file cannot take and Node does not always resolve, so it edits TypeScript mocks files only. |
| `MOCKS_IS_LINK` | *courier.mocks.ts* is a symbolic link. Studio saves an edit by replacing the file, which would replace the link with a copy, so Studio edits only a regular file. |
| `MOCKS_NOT_REGULAR` | *courier.mocks.ts* is a directory, so Studio cannot edit it as a mocks file. |
| `MOCKS_HARD_LINKED` | *courier.mocks.ts* has *2* hard links. Studio saves an edit by replacing the file, which would part it from its other names, so it leaves the file to you. |
| `MOCKS_NOT_OWNED` | *courier.mocks.ts* belongs to user *501*, but Studio runs as user *502*. An edited file would belong to user *502*, so Studio leaves it to its owner. |
| `MOCKS_NOT_WRITABLE` | Studio may not write *courier.mocks.ts* (*EACCES*). Studio does not edit a file that is read-only to it. |
| `MOCKS_TOO_LARGE` | *courier.mocks.ts* is *n* bytes, more than the 1048576 bytes (1 MiB) Studio edits. |
| `MOCKS_GENERATED` | Line *n* of *courier.mocks.ts* marks the file as generated, so an edit would be lost when it is generated again. Change what generates it instead. (`@generated` or `DO NOT EDIT` in its first five lines.) |
| `NOT_UTF8` | *courier.mocks.ts* is not valid UTF-8 text. Studio edits only text it can read in full, so it leaves this file as it is. |
| `PARSE_ERROR` | *courier.mocks.ts* does not parse: *problem* |
| `MOCKS_COMMONJS` | *courier.mocks.ts* exports with *module.exports* (line *n*); Studio edits only a mocks file that is an ES module. |
| `MOCKS_NOT_LITERAL` | *courier.mocks.ts* does not export an object literal Studio can add to. Or it names what the file exports instead: the result of another call than `defineMocks`, more than one default export, a type, a variable not declared with `const`, or a getter, setter or method among the mocks. |
| `MOCKS_KEYS_HIDDEN` | *courier.mocks.ts* (line *n*) spreads another object into the mocks, so Studio cannot see every key. Or a computed key, `__proto__`, or keys declared outside the object Studio would add to. |
| `IMPORT_NAME_TAKEN` | *courier.mocks.ts* already declares defineMockServer on line *n*, so Studio cannot import defineMockServer from @noverax/courier-mock under that name. |
| `MOCK_PACKAGE_UNLOADABLE` | Studio could not load @noverax/courier-mock in this project: *reason*. Install it with *npm install --save-dev @noverax/courier-mock hono @hono/node-server*, then ask again. (The command follows the project's lockfile.) |
| `WRITE_FAILED` | Studio could not write *courier.mocks.ts* (*error*). |
| `INTERNAL_PLAN_REJECTED` | Studio could not verify its edit of *courier.mocks.ts* (*problem*), so it changed nothing. |
| `NOT_LOCAL_PEER` | Studio edits project files only for a browser on this machine. Add the mocks to your mocks file by hand, or open Studio on the machine it runs on. |

<br />

## How Studio loads the project

Studio loads `courier.config.*` from its project root — the working directory, or `--cwd` — and `courier.mocks.*` beside it, together. It watches both, every module of the project they import — the file that runs, so where a compiled `api.js` sits beside `api.ts` an import of `./api` runs and watches `api.js` — and the tsconfig files their path aliases are read from, the ones `tsconfig.json` extends included, and loads them again when one is saved; a config or mocks file created under another of its names is picked up too, and so is a module created where an import would run it instead, such as an `api.js` compiled beside the `api.ts` that ran. Every load — the first, each reload, and each edit Studio makes to `courier.mocks.ts` — runs on one chain, one at a time and in order, and a save made while a load runs is loaded once it ends. A Studio page that opens, reconnects or reloads is sent what Studio already runs, so it loads nothing.

An import follows the project's tsconfig `paths` as TypeScript does, except that an alias never takes an import of an installed package elsewhere: TypeScript tries the alias first, while the loader cannot fall back to the package when the alias leads nowhere. An alias for one package, such as `@acme/ui` to `../ui/src`, is not followed while that package is installed; one for a whole scope, `@acme/*`, is followed for the names in it the project did not install, so an installed `@acme/ui` loads the build it ships while `@acme/utils` loads from the alias; and a catch-all `*` is not followed.

A config loads only when every entry under `imports` has the fields `CourierImportEntry` declares, each of its kind — a `from` that is an http or https URL, a `validation` Studio knows, a `transform` that is a function; otherwise the load fails with a message naming the entry and the field.

While `courier.config` does not load, or after it is deleted, Studio keeps running the sources it loaded last, and says so:

- The APIs page names the file — with the loader's message when it does not load — and the time the sources it shows were loaded. A config that has never loaded gets its message instead of sources, and a project without one is told to create `courier.config.ts` and offered the config to start it from.
- The status bar shows `config error` or `config deleted` on every page, with the details as its title.
- **Import API** and **Add mock server** are turned off, and say why.
- A request that writes an import's files, or cleans up after one, is refused with `{ error, code }`: 409 `CONFIG_NOT_LOADING` or `CONFIG_MISSING` until the config is fixed or created, and 503 `STUDIO_STARTING` or `CONFIG_RELOADING` while a load is still under way. Removing an import does not need the config to load.

One load may take 20 s. A load that takes longer — a config that awaits a database connection at top level, say — fails with `CONFIG_LOAD_TIMEOUT`, and Studio keeps running what it ran. The load itself goes on, since nothing can stop a module's evaluation. If it ends while its failure is still Studio's latest outcome, Studio takes how it ended: it runs the config when none of the files it read has changed since, loads it again when one has, and reports the real error when it failed. Until they end, loads given up keep their modules in memory; Studio warns at every fifth one still running, and a restart frees them. Studio reads its address from the config before it listens, under the same limit; a config that takes longer is not waited for, and Studio listens where its flags or the defaults say.

Every load evaluates the config, the mocks file and the TypeScript modules they import again, so an edit to any of them is seen at once. What Studio reuses is each module's transform, while its bytes stay the same. It keeps those in `.cache/courier/transform` in the nearest `node_modules` at or above the project root, so the next start — and each mock's worker, and a build plugin reading Studio's address — transforms only what changed. Studio creates the directory with mode 0700 and deletes entries that have gone unused for 30 days. It keeps transforms in memory only, and logs why at debug level, when there is no `node_modules` (as with Yarn Plug'n'Play), when `COURIER_TRANSFORM_CACHE` turns the directory off, and on POSIX when `node_modules` or its `.cache` is a symbolic link or belongs to another user, or `courier` or `transform` in it is a link, belongs to another user or is writable by its group or others: the files there are code Studio runs. It never uses the system's temporary directory instead.

A module Node runs itself stays as Node first ran it until Studio restarts, so an edit to it is seen only then: a JavaScript module the config or the mocks file imports — `.mjs`, `.cjs` or `.js` — and any module other than JSON that a CommonJS config or mocks file loads with `require()`, TypeScript included.

| Variable | Unset | Set |
|---|---|---|
| `COURIER_CONFIG_LOAD_TIMEOUT_MS` | One load may take 20 s. | A whole number of milliseconds, from 1 to 86400000, gives a slow project longer. Read when Studio starts; any other value is ignored with a warning, in the terminal and the startup banner. |
| `COURIER_TRANSFORM_CACHE` | Transforms are kept in `node_modules/.cache/courier/transform`. | `0`, `false` or `off`, in any case, keeps them in memory only. |

<br />

## Specifications on a private network

**Import API** and the update checks fetch a specification by URL on your behalf, so Studio does not reach into a network you could not see from your own browser. It connects to public addresses, and to this machine when the URL you gave points there — a specification your own dev server serves — following redirects as long as every hop stays on this machine. This machine is its loopback addresses and every address of its own network interfaces, a global IPv6 address included; a public address your router sends back to this machine, by hairpin NAT, is on none of them, so Studio cannot tell it from another machine's. It reaches a host on a private network, or this machine once any hop has been elsewhere, only when `studio.allowedSpecHosts` in `courier.config.ts` names that host:

```ts
// courier.config.ts
import { defineConfig } from "@noverax/courier/config"
import { api } from "./src/api"

export default defineConfig({
  sources: { api },
  studio: { allowedSpecHosts: ["gitlab.internal", "10.0.0.7:8080"] },
})
```

- Studio reads the list only when a fetch would reach such a host, from `courier.config` as it is on disk at that moment: a host a save has just added or removed counts.
- While `courier.config` does not load, no private host is reached, not even one the last config that loaded named: the request is refused with 409 `CONFIG_NOT_LOADING`, and with 503 while Studio is still loading the config. A project without a config is told to create one and name the host there.
- List hosts literally. An entry is the host the URL names, in any case — `gitlab.internal` allows it on any port, `10.0.0.7:8080` on that port only — and an IPv6 address may be written with or without brackets. A URL that names no port has its scheme's default, so `gitlab.internal:443` allows `https://gitlab.internal`. A host computed from something Studio does not watch, such as an environment variable or a file the config reads, is taken as of the last load, and one computed in a module Node runs itself as of the last time Node ran it.
- `0.0.0.0` and `::`, which mean every interface, are never reached, even when listed.
- Every hop is checked as it connects: a host name is resolved once, every address it resolves to must pass, and the connection goes to one of those; a redirect is followed only once its target passes the same check, up to five redirects.
- A URL Studio refuses, such as one that is not `http://` or `https://` or that names a private host the list does not, is answered 400. A host Studio could not read is answered 502, with a message that says which and why: it could not be reached, did not answer or finish sending within 60 s, answered with an error status, redirected more than five times or to something that is not an `http://` or `https://` URL, sent a response that is not HTTP Studio can parse, or sent a body that was cut off, does not decompress or passes 64 MB. A check of every import reports the same message as that import's result.

<br />

## Programmatic

```ts
import { createStudioServer } from "@noverax/courier-studio/server"

const studio = createStudioServer({
  port: 6280,
  onReady: (url) => console.log(`Studio at ${url}`),
  onError: (error) => console.error(error.message),
})

await studio.close()
```

### `createStudioServer(options?: StudioServerOptions): StudioServer`

Starts Studio and returns at once with `url`, `token` — the project's token, which a page opened at `` `${url}/#token=${token}` `` presents to make changes — and `close()`. `onReady` fires once it listens, with the URL a browser opens — a wildcard host reads as `localhost`, and with `port: 0` the URL carries the port the system picked; `onError` fires instead when it cannot listen — the port is taken, or the host cannot be bound. Options: `port`, `host`, `projectRoot`, `mockBasePort`, `extraCorsOrigins` (more origins that may act as the Studio UI), `onReady`, `onError`.

<br />

## License

[MIT](../../LICENSE)
