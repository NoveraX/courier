import { attachRuntime } from "@noverax/courier-studio-core/runtime";

import { startProxy } from "./server";

/* Connects to Courier Studio when it runs — its Timeline then shows each
   request the proxy serves, and its Playground sends them — and changes
   nothing when it does not. */
await attachRuntime();
const proxy = await startProxy();
console.log(`Proxy at ${proxy.url}`);
