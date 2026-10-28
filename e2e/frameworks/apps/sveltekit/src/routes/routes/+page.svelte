<script>
import { routes } from "@noverax/courier/routes";
import { onMount } from "svelte";

let { data } = $props();
let client = $state("");
onMount(() => {
  client = Object.keys(routes.catalog.endpoints).join(",");
});
</script>

<p id="server-routes">{data.server}</p>
<p id="client-routes">{client}</p>
