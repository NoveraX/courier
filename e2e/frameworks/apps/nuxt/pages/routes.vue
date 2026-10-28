<script setup lang="ts">
import { routes } from "@noverax/courier/routes";

/* Read while the server renders the page, and carried to the browser as rendered. */
const server = useState("server-routes", () => Object.keys(routes.catalog.endpoints).join(","));
const client = ref("");
onMounted(() => {
  client.value = Object.keys(routes.catalog.endpoints).join(",");
});
</script>

<template>
  <main>
    <p id="server-routes">{{ server }}</p>
    <p id="client-routes">{{ client }}</p>
  </main>
</template>
