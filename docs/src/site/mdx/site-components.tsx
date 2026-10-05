import type { MDXComponents } from "mdx/types"

import { Callout } from "./callout"
import { CodeGroup } from "./code-group"
import { ComparisonTable } from "./comparison-table"
import { Fence } from "./fence"
import { Heading } from "./heading"
import { ModeBadge } from "./mode-badge"
import { SiteLink } from "./site-link"

/**
 * How a page's MDX renders on the site: headings with links to themselves,
 * text in the site's type, fenced code as code panels, tables, and the
 * components pages use — Callout, CodeGroup, ComparisonTable, ModeBadge.
 * Passed to a page's content as `components`, they replace the ones the
 * MDX provider gives.
 *
 * @example
 * ```tsx
 * <Content components={SITE_COMPONENTS} />
 * ```
 */
export const SITE_COMPONENTS: MDXComponents = {
  h2: ({ id, children }) => (
    <Heading level={2} id={id}>
      {children}
    </Heading>
  ),
  h3: ({ id, children }) => (
    <Heading level={3} id={id}>
      {children}
    </Heading>
  ),
  h4: ({ id, children }) => (
    <Heading level={4} id={id}>
      {children}
    </Heading>
  ),
  p: ({ children }) => <p className="my-3.5 text-body text-fg-muted">{children}</p>,
  a: SiteLink,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  ul: ({ children }) => (
    <ul className="my-3.5 list-disc space-y-1.5 pl-5 text-body text-fg-muted marker:text-fg-subtle">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3.5 list-decimal space-y-1.5 pl-5 text-body text-fg-muted marker:font-mono marker:text-small marker:text-fg-subtle">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1 [&>p]:my-1.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-5 border-l-2 border-line-strong pl-4 text-fg-muted [&>p]:my-2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-10 border-0 border-t border-line" />,
  pre: ({ children, title }) => <Fence title={title}>{children}</Fence>,
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-panel border border-line bg-panel shadow-panel">
      <table className="w-full border-collapse text-left text-control">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-bg-subtle">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-line px-4 py-2.5 font-medium whitespace-nowrap text-fg-subtle">
      {children}
    </th>
  ),
  tr: ({ children }) => <tr className="border-b border-line last:border-b-0">{children}</tr>,
  td: ({ children }) => <td className="px-4 py-2.5 align-top text-fg-muted">{children}</td>,
  Callout,
  CodeGroup,
  ComparisonTable,
  ModeBadge,
}
