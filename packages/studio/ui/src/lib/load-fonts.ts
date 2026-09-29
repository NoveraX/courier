const FONTS_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;900&family=Geist+Mono:wght@400;500&display=swap";

/**
 * Load Studio's typefaces without holding the first render for them.
 *
 * Linked from the page's head, the stylesheet blocked rendering until it
 * arrived; with the font host unreachable — offline, or behind a firewall
 * that drops the packets — Studio stayed blank for about 30 seconds. Added
 * once the app starts, it renders at once in the fallback faces and takes the
 * fonts when they come, or never.
 *
 * @param doc - The document to add the stylesheet to
 * @example
 * ```ts
 * loadFonts(document);
 * ```
 */
export function loadFonts(doc: Document): void {
  if (doc.querySelector(`link[href="${FONTS_STYLESHEET}"]`)) return;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = FONTS_STYLESHEET;
  doc.head.append(link);
}
