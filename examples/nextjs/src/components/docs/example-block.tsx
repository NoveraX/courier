import type { ReactNode } from "react"

import { highlightCode } from "@/lib/shiki"

import { Example } from "./example"

type ExampleBlockProps = {
  title: string
  description: string
  code: string
  language?: string
  children: ReactNode
  learnMoreHref?: string
  learnMoreLabel?: string
  className?: string
}

export async function ExampleBlock({
  code,
  language = "typescript",
  ...props
}: ExampleBlockProps) {
  const highlightedCode = await highlightCode(code, { lang: language })
  return <Example {...props} code={code} highlightedCode={highlightedCode} />
}
