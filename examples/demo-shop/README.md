# demo-shop

The project behind Courier Studio's live demo: a small shop and its payments provider, called through Courier, with Studio watching every call. It runs on its own, and in a container on a public address.

- **Two backends** in `src/upstream` that know nothing of Courier: the shop — a catalog, carts, orders behind a service key that lasts 45 seconds, and a stream of orders as they move — and a payments provider whose charges take their time and now and then fail.
- **One definition of each** in `src/api`, with middleware Studio shows in its chains: a request id on every call, the shop's key issued again when it expires, the catalog cached, failed charges retried.
- **The shop's own server** in `src/app`: Courier's proxy in front of the shop, at the endpoints its boundary names, keeping a stream of deals and a support chat itself. It serves the payments provider too, which no page may call through it.
- **Traffic** in `src/traffic`: shoppers browsing, filling carts and checking out — as their pages and the shop's server code call it — following the streams, asking the support chat, and a front end developed against the mocks. Some of it is what Studio's audit points out: a product grid that asks for each card on its own, a charge retried although it writes, a cart changed without credentials.
- **Two mocks** in `courier.mocks.ts`, which Studio starts: the whole shop with data and scenarios, and the payments provider answering charges only.

## Run it

From the repository's root, once its packages are built:

```bash
cd examples/demo-shop
npm run demo
```

`npm run demo` starts the backends, Studio, the shop's server and the traffic, each in a process of its own, and starts them all again from a clean state every hour. Studio listens on port 6280, and prints the link that carries its token — the host's link. A page opened without it is a visitor's.

Each part also runs on its own: `npm run upstream`, `npm run app`, `npm run traffic`, beside `npx @noverax/courier-studio`.

| Variable | Default | What it sets |
| --- | --- | --- |
| `STUDIO_PORT` | `6280` | Studio's port |
| `APP_PORT` | `3001` | The shop's server's port |
| `SHOP_PORT`, `PAYMENTS_PORT` | `4501`, `4502` | The backends' ports |
| `SHOP_MOCK_PORT`, `PAYMENTS_MOCK_PORT` | `7101`, `7102` | The mocks' ports |
| `DEMO_RESET_MINUTES` | `60` | How often the demo starts again from a clean state |
| `DEMO_ORIGIN` | — | The address visitors open, when Studio sits behind a proxy on a domain of its own |
| `SHOPPERS` | `2` | How many shoppers browse at once, up to 4 |

## What a visitor may do

Studio runs as a public demo (`createStudioServer({ demo })`, in `src/demo/studio.ts`). A visitor reads everything Studio shows, without the credentials the calls carry. A visitor may also send from the Playground and drive the mocks — start and stop them, slow them down, make them fail, switch scenarios, change their data — within limits that keep one visitor from crowding out the rest. A visitor's clears stay in their own page and their Playground history is their own. The demo writes no file, so importing an API, generating mocks and saving a session are for a project of one's own.

## In a container

```bash
docker build -f examples/demo-shop/Dockerfile -t courier-studio-demo .
docker run --rm -p 6280:6280 courier-studio-demo
```

Build it from the repository's root. The image builds the packages the demo uses, packs them as npm publishes them and installs them as a project would, so it carries their runtime dependencies only and runs what users get. It runs as the unprivileged `node` user and publishes Studio's port alone. `compose.yml` runs it as a host such as Dokploy does, from this repository: point a domain at port 6280 with HTTPS, and set `DEMO_ORIGIN` to that domain's address.

`compose.yml` also locks the container down. Its file system is read-only but for two memory-backed folders — the demo's state in `.courier`, which each reset empties, and `/tmp` — so nothing a visitor does writes a file. It runs with no capabilities, within fixed memory, CPU and process limits, keeps its logs to 30 MB, and reports its health from Studio's `/api/health`.

The proxy in front must say who each visitor is in `X-Forwarded-For`, as Traefik, Caddy and nginx's usual configuration do. The demo counts each visitor's share by that address — requests, sockets, Playground calls, mock commands — so without it every visitor would share the proxy's.
