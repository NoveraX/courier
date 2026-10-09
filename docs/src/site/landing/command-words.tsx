import { cn } from "@/site/cn"

/**
 * A shell command whose lines break between its words, never inside one:
 * on a narrow screen `--framework next` moves to the next line whole,
 * rather than splitting at a dash the way a browser breaks hyphenated text.
 *
 * @param props - The command, and the colour of a word where one stands apart
 * @returns The words, a space between each
 * @example
 * ```tsx
 * <CommandWords
 *   command="npx @noverax/create-courier --framework next"
 *   toneOf={(word, at, words) => (at === words.length - 1 ? "text-fg" : undefined)}
 * />
 * ```
 */
export function CommandWords({
  command,
  toneOf,
}: {
  command: string
  toneOf?: (word: string, at: number, words: readonly string[]) => string | undefined
}) {
  const words = command.split(" ").filter((word) => word !== "")
  return words.map((word, at) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a command's words are fixed and a word may repeat
    <span key={at}>
      {at > 0 && " "}
      <span className={cn("whitespace-nowrap", toneOf?.(word, at, words))}>{word}</span>
    </span>
  ))
}
