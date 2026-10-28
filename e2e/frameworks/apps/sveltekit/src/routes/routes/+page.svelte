<script>
import { createProxyCaller } from "@noverax/courier";
import { routes } from "@noverax/courier/routes";
import { onMount } from "svelte";

let { data } = $props();
let client = $state("");
let call = $state("");
onMount(async () => {
  client = Object.keys(routes.catalog.endpoints).join(",");
  const catalog = createProxyCaller(routes.catalog, { proxyPath: { http: "/api/request" } });
  call = await catalog.profile().then(JSON.stringify, (error) => `failed: ${error.message}`);
});
</script>

<p id="server-routes">{data.server}</p>
<p id="client-routes">{client}</p>
<pre id="client-call">{call}</pre>
