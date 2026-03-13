import { createFileRoute } from "@tanstack/react-router";
import { SettingsView } from "../views/settings";
import { GridSkeleton } from "../components/skeleton";

export const Route = createFileRoute("/settings")({
  component: SettingsView,
  pendingComponent: GridSkeleton,
});
