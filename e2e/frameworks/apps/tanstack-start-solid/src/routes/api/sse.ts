import { sseRoute } from "@noverax/courier-tanstack-start";
import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/api/sse")({ server: { handlers: sseRoute() } });
