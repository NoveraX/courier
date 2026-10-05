/**
 * Highlighted code inside a code panel: the site's code size on the panel's
 * dotted ground, scrolling sideways when a line is longer than the panel.
 *
 * @param props - The highlighted HTML, as `highlight` returns it
 * @returns The body
 * @example
 * ```tsx
 * <CodeBody html={await highlight(code, "ts")} />
 * ```
 */
export function CodeBody({ html }: { html: string }) {
  return (
    <div
      className="dots overflow-x-auto [&>pre]:m-0 [&>pre]:w-max [&>pre]:min-w-full [&>pre]:px-5 [&>pre]:py-4.5 [&>pre]:text-code [&>pre]:outline-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
