import { createRootRoute } from "@tanstack/react-router";

import { validateInspectorSearch } from "@/features/requests/inspector-search";
import { useTickProvider } from "@/hooks/use-tick";
import { NotFoundScreen } from "@/screens/not-found-screen";
import { ShellToaster } from "@/shell/shell-toaster";
import { StudioShell } from "@/shell/studio-shell";
import { useSocketConnection } from "@/socket";

function RootComponent(): React.ReactNode {
  useSocketConnection();
  useTickProvider();
  return (
    <>
      <StudioShell />
      <ShellToaster />
    </>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundScreen,
  validateSearch: validateInspectorSearch,
});
