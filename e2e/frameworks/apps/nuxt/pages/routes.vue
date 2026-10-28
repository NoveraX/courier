<script setup lang="ts">
import { createProxyCaller } from "@noverax/courier";
import { routes } from "@noverax/courier/routes";

/* Read while the server renders the page, and carried to the browser as rendered. */
const server = useState("server-routes", () => Object.keys(routes.catalog.endpoints).join(","));
const client = ref("");
const call = ref("");
onMounted(async () => {
  client.value = Object.keys(routes.catalog.endpoints).join(",");
  const catalog = createProxyCaller(routes.catalog, { proxyPath: { http: "/api/request" } });
  call.value = await catalog
    .profile()
    .then(JSON.stringify, (error: Error) => `failed: ${error.message}`);
});
</script>

<template>
  <main>
    <p id="server-routes">{{ server }}</p>
    <p id="client-routes">{{ client }}</p>
    <pre id="client-call">{{ call }}</pre>
  </main>
</template>
