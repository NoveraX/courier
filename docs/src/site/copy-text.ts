/**
 * Put text on the clipboard: through the Clipboard API where the page may
 * use it, else through a selection — a page opened over plain http from
 * another address has no Clipboard API.
 *
 * @param text - The text
 * @returns Whether it was copied
 * @example
 * ```ts
 * if (await copyText(code)) setCopied(true)
 * ```
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (error) {
      console.warn("The Clipboard API refused the copy; copying through a selection", error)
    }
  }
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.append(area)
  area.select()
  const copied = document.execCommand("copy")
  area.remove()
  return copied
}
