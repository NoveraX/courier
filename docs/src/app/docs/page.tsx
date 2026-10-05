import { redirect } from "next/navigation"

export default function DocsIndex(): never {
  redirect("/docs/introduction")
}
