import { createFileRoute } from "@tanstack/react-router";

import { SettingsScreen } from "@/screens/settings/settings-screen";

export const Route = createFileRoute("/next/settings")({
  component: SettingsScreen,
});
