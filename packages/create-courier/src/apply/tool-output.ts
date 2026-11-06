import { SETUP_LIMITS } from "../limits";

/**
 * What a program prints, read a line at a time as it comes — a line past
 * the longest one read whole is cut there — with the end of it kept, for
 * a failure to show: memory for neither grows with the output.
 *
 * @example
 * ```ts
 * const reader = new ToolOutputReader((line) => findings.push(line));
 * child.stdout.on("data", (chunk) => reader.push(String(chunk)));
 * ```
 */
export class ToolOutputReader {
  readonly #line: ((line: string) => void) | undefined;
  #pending = "";
  /* The line being read is past the longest read whole, and what is left of it is dropped. */
  #cut = false;
  #tail = "";

  /**
   * @param line - Called with each line, its line end left out; none to keep only the end
   */
  constructor(line?: (line: string) => void) {
    this.#line = line;
  }

  /** The end of what the program printed. */
  get tail(): string {
    return this.#tail;
  }

  /**
   * Take what the program printed next.
   *
   * @param text - The text, decoded
   */
  push(text: string): void {
    this.#tail = (this.#tail + text).slice(-SETUP_LIMITS.tailChars);
    if (this.#line === undefined) return;
    const lines = text.split("\n");
    const last = lines.pop() ?? "";
    for (const each of lines) {
      this.#add(each);
      this.#emit();
    }
    this.#add(last);
  }

  /** Read the last line, which no line end closed. */
  end(): void {
    if (this.#line !== undefined && (this.#pending !== "" || this.#cut)) this.#emit();
  }

  #add(text: string): void {
    if (this.#cut) return;
    const room = SETUP_LIMITS.lineChars - this.#pending.length;
    this.#pending += text.slice(0, room);
    if (text.length > room) this.#cut = true;
  }

  #emit(): void {
    const line = this.#pending.endsWith("\r") ? this.#pending.slice(0, -1) : this.#pending;
    this.#pending = "";
    this.#cut = false;
    this.#line?.(line);
  }
}
