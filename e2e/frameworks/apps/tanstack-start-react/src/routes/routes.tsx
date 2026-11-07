import { createProxyCaller } from "@noverax/courier/client";
import { routes } from "@noverax/courier/routes";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/routes")({ component: RoutesPage });

const opened = (): string => Object.keys(routes.catalog.endpoints).join(",");

function RoutesPage() {
  const [client, setClient] = useState("");
  const [call, setCall] = useState("");
  useEffect(() => {
    setClient(opened());
    const catalog = createProxyCaller(routes.catalog, { proxyPath: { http: "/api/request" } });
    catalog
      .profile()
      .then(JSON.stringify, (error: Error) => `failed: ${error.message}`)
      .then(setCall);
  }, []);
  return (
    <main>
      <p id="server-routes">{opened()}</p>
      <p id="client-routes">{client}</p>
      <pre id="client-call">{call}</pre>
    </main>
  );
}
