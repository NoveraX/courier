<script setup lang="ts">
import { createProxyCaller } from "@noverax/courier";

import type { accountsApi } from "~/lib/api";

/* While the server renders the page, the proxy caller reaches the proxy in the same process; in the browser, its route. */
const proxy = createProxyCaller<typeof accountsApi>("accounts");
const { data } = await useAsyncData("proxy-me", () => proxy.me());
const fromBrowser = ref("");

async function run(): Promise<void> {
  await proxy.login({ user: "proxy" });
  fromBrowser.value = JSON.stringify(await proxy.me());
}
</script>

<template>
  <main>
    <pre id="proxy">{{ JSON.stringify(data) }}</pre>
    <button id="proxy-run" type="button" @click="run">Run</button>
    <pre id="proxy-browser">{{ fromBrowser }}</pre>
  </main>
</template>
