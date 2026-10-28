import { routes } from "@noverax/courier/routes";

/* The routes as the server that renders the page has them. */
export function load() {
  return { server: Object.keys(routes.catalog.endpoints).join(",") };
}
