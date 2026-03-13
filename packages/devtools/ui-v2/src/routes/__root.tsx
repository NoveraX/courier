import { createRootRoute, Outlet } from "@tanstack/react-router";

function RootComponent() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <main className="flex flex-1 items-center justify-center">
        <Outlet />
      </main>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
