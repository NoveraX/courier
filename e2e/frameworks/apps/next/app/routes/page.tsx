import { routes } from "@noverax/courier/routes";

import { ClientRoutes } from "./client-routes";

export default function RoutesPage() {
  return (
    <main>
      <p id="server-routes">{Object.keys(routes.catalog.endpoints).join(",")}</p>
      <ClientRoutes />
    </main>
  );
}
