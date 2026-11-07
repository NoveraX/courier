import { apiRoute } from "@noverax/courier-tanstack-start";
import { createFileRoute } from "@tanstack/solid-router";

/* The proxy a page's client built from the routes calls. */
export const Route = createFileRoute("/api/request")({ server: { handlers: apiRoute() } });
