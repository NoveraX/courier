import { routes } from "@noverax/courier/routes";
import { useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";

const opened = (): string => Object.keys(routes.catalog.endpoints).join(",");

/* The routes as the server that renders the page has them. */
export function loader() {
  return { server: opened() };
}

export default function RoutesPage() {
  const { server } = useLoaderData<typeof loader>();
  const [client, setClient] = useState("");
  useEffect(() => setClient(opened()), []);
  return (
    <main>
      <p id="server-routes">{server}</p>
      <p id="client-routes">{client}</p>
    </main>
  );
}
