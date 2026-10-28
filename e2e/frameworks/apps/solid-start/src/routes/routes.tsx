import { createProxyCaller } from "@noverax/courier";
import { routes } from "@noverax/courier/routes";
import { createSignal, onMount } from "solid-js";

const opened = (): string => Object.keys(routes.catalog.endpoints).join(",");

export default function RoutesPage() {
  const [client, setClient] = createSignal("");
  const [call, setCall] = createSignal("");
  onMount(async () => {
    setClient(opened());
    const catalog = createProxyCaller(routes.catalog, { proxyPath: { http: "/api/request" } });
    setCall(
      await catalog.profile().then(JSON.stringify, (error: Error) => `failed: ${error.message}`),
    );
  });
  return (
    <main>
      <p id="server-routes">{opened()}</p>
      <p id="client-routes">{client()}</p>
      <pre id="client-call">{call()}</pre>
    </main>
  );
}
