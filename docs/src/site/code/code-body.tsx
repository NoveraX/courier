import { cn } from "@/site/cn"

/**
 * Highlighted code inside a code panel: the site's code size on the panel's
 * dotted ground, scrolling sideways when a line is longer than the panel. A
 * drawing — a diagram or a file tree in box-drawing glyphs — is set at the
 * font's own line height, 1.3, where its upright strokes meet.
 *
 * @param props - The highlighted HTML, as `highlight` returns it, and whether it is a drawing
 * @returns The body
 * @example
 * ```tsx
 * <CodeBody html={await highlight(code, "ts")} />
 * ```
 */
export function CodeBody({ html, drawing = false }: { html: string; drawing?: boolean }) {
  return (
    <div
      className={cn(
        "dots overflow-x-auto [&>pre]:m-0 [&>pre]:w-max [&>pre]:min-w-full [&>pre]:px-5 [&>pre]:py-4.5 [&>pre]:text-code [&>pre]:outline-none",
        drawing && "[&>pre]:leading-[1.3]"
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
