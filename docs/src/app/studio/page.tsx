import type { Metadata } from "next"

import { StudioLandingPage } from "@/site/studio-landing/studio-landing-page"

export const metadata: Metadata = {
  title: { absolute: "Courier Studio — see every request your app makes" },
  description:
    "Courier Studio is a visual debugger for your API layer. Inspect live traffic, replay calls, mock backends, inject failures and audit quality — from one tab next to your dev server.",
}

export default function Page() {
  return <StudioLandingPage />
}
