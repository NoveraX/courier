import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import { HydrationScript } from "solid-js/web";

export const Route = createRootRoute({
  head: () => ({ meta: [{ charset: "utf-8" }] }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
});

function RootDocument(props: { children: JSX.Element }) {
  return (
    <html lang="en">
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        {props.children}
        <Scripts />
      </body>
    </html>
  );
}
