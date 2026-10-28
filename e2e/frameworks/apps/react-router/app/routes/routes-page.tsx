import { createProxyCaller } from "@noverax/courier";
import { routes } from "@noverax/courier/routes";
import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";

const opened = (): string => Object.keys(routes.catalog.endpoints).join(",");

/* The routes as the server that renders the page has them. */
export function loader() {
  return { server: opened() };
}

export default function RoutesPage() {
  const { server } = useLoaderData<typeof loader>();
  const [client, setClient] = useState("");
  const [call, setCall] = useState("");
  useEffect(() => {
    setClient(opened());
    const catalog = createProxyCaller(routes.catalog, { proxyPath: { http: "/api/request" } });
    catalog.profile().then(
      (me) => setCall(JSON.stringify(me)),
      (error: Error) => setCall(`failed: ${error.message}`),
    );
  }, []);
  return (
    <main>
      <p id="server-routes">{server}</p>
      <p id="client-routes">{client}</p>
      <pre id="client-call">{call}</pre>
    </main>
  );
}
