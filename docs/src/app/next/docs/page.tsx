import { redirect } from "next/navigation"

import { sitePath } from "@/site/site-path"

export default function DocsIndex(): never {
  redirect(sitePath("/docs/introduction"))
}
