import type { TimingMetric } from "./trace"

/* A token's characters, as HTTP names them. */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]$/
const NUMBER = /^-?\d+(?:\.\d+)?$/

/**
 * Metrics as a `Server-Timing` header writes them: each duration to a
 * tenth of a millisecond, each description quoted.
 *
 * @param metrics - The metrics, their descriptions ASCII already
 * @returns The header's value
 * @example
 * ```ts
 * formatServerTiming([{ name: "api", duration: 20, description: "POST /users 201" }])
 * // 'api;dur=20.0;desc="POST /users 201"'
 * ```
 */
export function formatServerTiming(metrics: readonly TimingMetric[]): string {
  return metrics
    .map(({ name, duration, description }) => {
      const timed = duration === undefined ? "" : `;dur=${Math.max(0, duration).toFixed(1)}`
      const said = description === "" ? "" : `;desc="${description.replace(/["\\]/g, "\\$&")}"`
      return `${name}${timed}${said}`
    })
    .join(", ")
}

/* A reader of a header's value, from one place in it on. */
class HeaderReader {
  at = 0
  constructor(readonly text: string) {}
  /* The character at the reader's place: a call, so that each read sees where the reader is now. */
  peek(): string {
    return this.text.charAt(this.at)
  }
  get done(): boolean {
    return this.at >= this.text.length
  }
  spaces(): void {
    while (this.peek() === " " || this.peek() === "\t") this.at += 1
  }
  token(): string {
    const start = this.at
    while (!this.done && TOKEN.test(this.peek())) this.at += 1
    return this.text.slice(start, this.at)
  }
  /* A quoted string's text, or `undefined` where the header ends before its closing quote. */
  quoted(): string | undefined {
    let text = ""
    for (this.at += 1; !this.done; this.at += 1) {
      if (this.peek() === '"') {
        this.at += 1
        return text
      }
      if (this.peek() === "\\") this.at += 1
      text += this.peek()
    }
    return undefined
  }
  /* Past the comma that ends the metric, quotes and all. */
  skipMetric(): void {
    while (!this.done && this.peek() !== ",") {
      if (this.peek() !== '"') this.at += 1
      else if (this.quoted() === undefined) return
    }
  }
}

/* One metric, from its name on: its parameters as browsers read them, the first of each kept. */
function readMetric(reader: HeaderReader): TimingMetric | undefined {
  const name = reader.token()
  let duration: number | undefined
  let description: string | undefined
  for (reader.spaces(); reader.peek() === ";"; reader.spaces()) {
    reader.at += 1
    reader.spaces()
    const key = reader.token().toLowerCase()
    reader.spaces()
    if (reader.peek() !== "=") continue
    reader.at += 1
    reader.spaces()
    const value = reader.peek() === '"' ? reader.quoted() : reader.token()
    if (value === undefined) return undefined
    if (key === "dur" && duration === undefined && NUMBER.test(value)) duration = Number(value)
    if (key === "desc" && description === undefined) description = value
  }
  if (name === "" || (!reader.done && reader.peek() !== ",")) return undefined
  return { name, ...(duration !== undefined && { duration }), description: description ?? "" }
}

/**
 * A `Server-Timing` header's metrics, read as a browser reads them: any
 * spacing, the parameters in any order, a description quoted or a token.
 * A metric the header breaks off in, or one it garbles, is left out; the
 * rest are read, and nothing in the header makes this throw.
 *
 * @param header - The header's value
 * @returns Its metrics, descriptions unquoted
 * @example
 * ```ts
 * parseServerTiming('courier;dur=30.0, rid;desc="req_x"')
 * // [{ name: "courier", duration: 30, description: "" }, { name: "rid", description: "req_x" }]
 * ```
 */
export function parseServerTiming(header: string): TimingMetric[] {
  const reader = new HeaderReader(header)
  const metrics: TimingMetric[] = []
  while (!reader.done) {
    reader.spaces()
    const metric = readMetric(reader)
    if (metric) metrics.push(metric)
    else reader.skipMetric()
    if (reader.peek() === ",") reader.at += 1
    else if (!reader.done) reader.skipMetric()
  }
  return metrics
}
