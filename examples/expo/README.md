<div align="center">
  <br />
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../docs/public/logos/courier-mark-light.svg" />
    <source media="(prefers-color-scheme: light)" srcset="../../docs/public/logos/courier-mark-dark.svg" />
    <img alt="Courier" src="../../docs/public/logos/courier-mark-dark.svg" height="40" />
  </picture>

  <h1>Courier on Expo</h1>

  <p><strong>One API definition, called from a React Native app on Hermes in every way Courier offers.</strong></p>

  <p>
    <a href="#run-it"><strong>Run it</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs/frameworks/react-native">React Native &amp; Expo</a>
    &nbsp;·&nbsp;
    <a href="../../README.md">Courier</a>
  </p>
  <br />
</div>

<br />

## What it shows

A React Native app, built with Expo and run on Hermes, calling one API
definition — [`src/api.ts`](src/api.ts) — in every way Courier offers:

- a list read with `useQuery`, and a search sent as `QUERY`, its terms in
  the body ([`src/demos/users-demo.tsx`](src/demos/users-demo.tsx));
- a file written on the device, uploaded with its progress
  ([`src/demos/upload-demo.tsx`](src/demos/upload-demo.tsx));
- server-sent events with `useSubscription`, and a chat channel over a
  WebSocket with `useChannel` ([`src/demos/live-demo.tsx`](src/demos/live-demo.tsx));
- a slow call cancelled by hand ([`src/demos/cancel-demo.tsx`](src/demos/cancel-demo.tsx)).

Each card on the screen says whether its part worked, and what came back.

The app calls a mock of the shop that Courier Studio runs from
[`courier.mocks.ts`](courier.mocks.ts): records generated from the API's
schemas, a search over them, a stream of thirty ticks, a channel that
echoes what it is sent, and an upload that answers with the file's name,
type and size.

## Run it

Build the packages once, from the repository root:

```bash
npm ci
npm run build
```

Then, in this directory, install the example from its lockfile:

```bash
npm ci
npm run server
```

That starts Studio on port 6310 and the shop's mock on port 7020. In a
second terminal:

```bash
npm run ios
```

The app opens in Expo Go on the iOS simulator; `npm run android` opens it
on the Android emulator. The packages are installed packed, as the
registry would ship them, so install them again with `npm ci` after
rebuilding them: their version does not change, and `npm install` takes the
copy it packed before for current. Stop Metro before you do, and start it
again with a clean cache: Metro keeps a map of `node_modules`, and a
package replaced while it runs leaves the app unable to resolve files that
are on disk.

```bash
npm ci
npm run ios -- --clear
```

## Addresses

An app has no page to resolve a path against, so the API's address is
absolute — [`src/address.ts`](src/address.ts) picks it: `localhost` from
the iOS simulator, `10.0.2.2` from the Android emulator. On a phone, give
the mock `hostname: "0.0.0.0"` in `courier.mocks.ts` — its admin API is
then open to your network as well — and start the app with the
computer's address:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:7020 npm start
```

## Checks

```bash
npm run typecheck
npm run bundle
```

The first typechecks the app and the mock; the second bundles the app
for iOS and Android, as CI does.

See [React Native & Expo](https://courier.noverax.cloud/docs/frameworks/react-native)
for what Courier does on React Native, with Expo and without.

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
