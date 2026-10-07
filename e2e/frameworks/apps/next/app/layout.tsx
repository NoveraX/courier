import type { ReactNode } from "react";

import { Hydrated } from "./hydrated";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Hydrated />
      </body>
    </html>
  );
}
