/* What an assistant gets of a page: enough to answer, short enough for an address. */
const MAX_MARKDOWN = 5500

/**
 * Links that open ChatGPT or Claude with a page of the docs in the prompt,
 * asking for help applying it — the page as Markdown, cut short past a few
 * thousand characters to keep the address one a browser opens.
 *
 * @param title - The page's title
 * @param markdown - The page as Markdown
 * @returns The two links
 * @example
 * ```ts
 * assistantLinks("Quick Start", markdown).claude // "https://claude.ai/new?q=I%27m%20reading…"
 * ```
 */
export function assistantLinks(
  title: string,
  markdown: string
): { chatgpt: string; claude: string } {
  const page =
    markdown.length > MAX_MARKDOWN ? `${markdown.slice(0, MAX_MARKDOWN)}\n\n[…truncated]` : markdown
  const prompt = `I'm reading the "${title}" page of the @noverax/courier docs. Here it is as Markdown — help me apply it to my project:\n\n${page}`
  const q = encodeURIComponent(prompt)
  return { chatgpt: `https://chatgpt.com/?q=${q}`, claude: `https://claude.ai/new?q=${q}` }
}
