import type { Metadata } from "next"

import { LandingPage } from "@/site/landing/landing-page"

export const metadata: Metadata = {
  title: { absolute: "@noverax/courier — type-safe HTTP for any framework, any REST backend" },
  description:
    "Define your API once in plain TypeScript. Get end-to-end inference, one proxy route for every endpoint, React Query bindings and middleware — against any REST backend, which needs zero changes.",
}

export default function Page() {
  return <LandingPage />
}
