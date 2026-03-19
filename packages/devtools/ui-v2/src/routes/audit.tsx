import { createFileRoute } from "@tanstack/react-router";
import { AuditView } from "../views/audit";

export const Route = createFileRoute("/audit")({
  component: AuditView,
});
