"use client"

import { QueryClient, QueryClientProvider } from "@noverax/courier-react"
import { type ReactNode, useState } from "react"

/**
 * The React Query client the docs' live examples share.
 *
 * @param props - The page
 * @returns The page, with the client
 * @example
 * ```tsx
 * <QueryProvider>{children}</QueryProvider>
 * ```
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
