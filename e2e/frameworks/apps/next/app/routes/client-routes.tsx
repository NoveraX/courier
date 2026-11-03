"use client";

import { createProxyCaller } from "@noverax/courier";
import { routes } from "@noverax/courier/routes";
import { useEffect, useState } from "react";

/* The routes as the browser's bundle holds them, and a call through the proxy built from them. */
export function ClientRoutes() {
  const [client, setClient] = useState("");
  const [call, setCall] = useState("");
  useEffect(() => {
    setClient(Object.keys(routes.catalog.endpoints).join(","));
    const catalog = createProxyCaller(routes.catalog, { proxyPath: { http: "/api/request" } });
    catalog.profile().then(
      (seen) => setCall(JSON.stringify(seen)),
      (error: Error) => setCall(`failed: ${error.message}`),
    );
  }, []);
  return (
    <>
      <p id="client-routes">{client}</p>
      <pre id="client-call">{call}</pre>
    </>
  );
}
