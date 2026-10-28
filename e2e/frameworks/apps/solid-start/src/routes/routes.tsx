import { routes } from "@noverax/courier/routes";
import { createSignal, onMount } from "solid-js";

const opened = (): string => Object.keys(routes.catalog.endpoints).join(",");

export default function RoutesPage() {
  const [client, setClient] = createSignal("");
  onMount(() => setClient(opened()));
  return (
    <main>
      <p id="server-routes">{opened()}</p>
      <p id="client-routes">{client()}</p>
    </main>
  );
}
