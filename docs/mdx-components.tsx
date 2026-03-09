import type { MDXComponents } from "mdx/types"
import Link from "next/link"

import { Callout } from "@/components/docs/callout"
import { CodeBlock } from "@/components/docs/code-block"
import { CodeGroup } from "@/components/docs/code-group"
import { ComparisonTable } from "@/components/docs/comparison-table"
import { StepList } from "@/components/docs/step-list"

function AnchorHeading({
  level,
  id,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"h2"> & { level: 2 | 3 | 4 }) {
  const Tag = `h${level}` as const
  return (
    <Tag id={id} className="group scroll-mt-24" {...props}>
      {children}
      <a
        href={`#${id}`}
        aria-hidden="true"
        tabIndex={-1}
        className="ml-2 text-muted-foreground/0 no-underline transition-colors group-hover:text-muted-foreground"
      >
        #
      </a>
    </Tag>
  )
}

function Pre({ children, ...props }: React.ComponentPropsWithoutRef<"pre">) {
  if (
    !children ||
    typeof children !== "object" ||
    !("props" in children) ||
    (children as React.ReactElement).type !== "code"
  ) {
    return <pre {...props}>{children}</pre>
  }

  const codeProps = (children as React.ReactElement<Record<string, unknown>>).props
  const code = typeof codeProps.children === "string" ? codeProps.children.trim() : ""
  const className = (codeProps.className as string) || ""
  const language = className.replace("language-", "") || "text"
  const filename = codeProps.title as string | undefined

  return <CodeBlock code={code} language={language} filename={filename} />
}

function CustomLink({ href, ...props }: React.ComponentPropsWithoutRef<"a">) {
  if (href?.startsWith("/") || href?.startsWith("#")) {
    return <Link href={href} {...props} />
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" {...props} />
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    pre: Pre,
    a: CustomLink as MDXComponents["a"],
    h2: (props) => <AnchorHeading level={2} {...props} />,
    h3: (props) => <AnchorHeading level={3} {...props} />,
    h4: (props) => <AnchorHeading level={4} {...props} />,
    Callout,
    CodeBlock,
    CodeGroup,
    ComparisonTable,
    StepList,
    ...components,
  }
}
