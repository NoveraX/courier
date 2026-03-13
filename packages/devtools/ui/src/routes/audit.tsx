import { createFileRoute } from "@tanstack/react-router";
import { AuditView } from "../views/audit";
import { TabSkeleton } from "../components/skeleton";

export const Route = createFileRoute("/audit")({
  component: AuditView,
  pendingComponent: TabSkeleton,
});
