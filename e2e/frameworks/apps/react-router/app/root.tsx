import { requestContext } from "@noverax/courier-remix/request-context";
import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts } from "react-router";

export const middleware = [requestContext()];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
