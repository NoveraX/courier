"use client"

import { QueryClient, QueryClientProvider } from "@noverax/courier-react"
import { type ReactNode, useState } from "react"

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
