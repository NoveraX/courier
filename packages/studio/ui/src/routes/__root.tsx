import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { Toaster } from "sonner";

import { ClassicShell } from "@/components/layout/classic-shell";
import { NotFound } from "@/components/layout/not-found";
import { useTickProvider } from "@/hooks/use-tick";
import { ShellToaster } from "@/shell/shell-toaster";
import { useSocketConnection } from "@/socket";

/* `/next` and below bring their own shell; every other page is framed by the classic one. */
function isInNewShell(pathname: string): boolean {
  return pathname === "/next" || pathname.startsWith("/next/");
}

function RootComponent(): React.ReactNode {
  useSocketConnection();
  useTickProvider();
  const inNewShell = useRouterState({ select: (s) => isInNewShell(s.location.pathname) });
  return (
    <>
      {inNewShell ? <Outlet /> : <ClassicShell />}
      {inNewShell ? (
        <ShellToaster />
      ) : (
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{ className: "text-body-sm" }}
        />
      )}
    </>
  );
}

function RootNotFound(): React.ReactNode {
  return <NotFound />;
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: RootNotFound,
});
