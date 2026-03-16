import { createFileRoute } from "@tanstack/react-router";
import { EndpointsCatalog } from "@/views/explorer/endpoints";

export const Route = createFileRoute("/explorer/endpoints")({
  component: EndpointsCatalog,
});
