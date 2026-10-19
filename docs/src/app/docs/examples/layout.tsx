import type { ReactNode } from "react"

import { QueryProvider } from "@/site/query-provider"

export const dynamic = "force-dynamic"

/* The live examples share one React Query client; no other page of the site loads React Query. */
export default function ExamplesLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>
}
