/**
 * How what the site's server saw of a call travels to the page: as
 * metrics of the answer's `Server-Timing`, which the browser parses and
 * hands the page. A description is ASCII, the rest written as escapes, so
 * a header carries any text; it is held to its length, and the metrics the
 * site adds to theirs; what does not fit is counted rather than sent. The
 * page reads only the metrics it knows, as far as its own limits go, and
 * nothing in a broken or a foreign header makes it throw.
 */
import { describe, expect, it } from "vitest"
import { traceOfTiming } from "@/site/inspector/seen-trace"
import { formatServerTiming, parseServerTiming } from "@/site/inspector/server-timing"
import { escapeTimingText, unescapeTimingText } from "@/site/inspector/timing-text"
import type { CallTrace } from "@/site/inspector/trace"
import { TRACE_TIMING_BYTES, traceMetrics } from "@/site/inspector/trace-metrics"
import { anyText, below, oneOf, seeded } from "../server/random"

/* Characters a description has to carry, beside those a page sends: the escapes' own. */
const AWKWARD = ["\\", "u", "0", ",", ";", "=", '"', "\r", "\n", "→", "é", "\u{1f600}", "a", " "]

function awkwardText(next: () => number, most: number): string {
  return Array.from({ length: below(next, most + 1) }, () => oneOf(next, AWKWARD)).join("")
}

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/

describe("a description's text", () => {
  it("is written in printable ASCII, and read back as it was", () => {
    for (const text of [
      "POST /users 201",
      "cookie → 200",
      "Ann & co / 50%",
      "\u{1f600}\r\n\\u0041",
    ]) {
      const written = escapeTimingText(text)
      expect(written).toMatch(PRINTABLE_ASCII)
      expect(unescapeTimingText(written)).toBe(text)
    }
    expect(escapeTimingText("a\\b")).toBe("a\\\\b")
    expect(escapeTimingText("→")).toBe("\\u2192")
  })

  it("is read back as it was for any text, whatever the seed", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const next = seeded(seed)
      const text = next() < 0.5 ? anyText(next, 40) : awkwardText(next, 40)
      const written = escapeTimingText(text)
      expect(written, `seed ${seed}`).toMatch(PRINTABLE_ASCII)
      expect(unescapeTimingText(written), `seed ${seed}`).toBe(text)
    }
  })

  it("is cut to its length with a mark, never through an escape or a character", () => {
    const cut = escapeTimingText("é".repeat(100), 40)
    expect(cut.length).toBeLessThanOrEqual(40)
    expect(cut.endsWith("\\u2026")).toBe(true)
    expect(unescapeTimingText(cut)).toBe(`${"é".repeat(5)}…`)
    const astral = unescapeTimingText(escapeTimingText("\u{1f600}".repeat(10), 30))
    expect(astral).toBe(`${"\u{1f600}".repeat(2)}…`)
    expect(escapeTimingText("short", 40)).toBe("short")
  })

  it("is not read at all when it holds an escape it does not write", () => {
    for (const written of ["a\\nb", "\\x41", "tail\\", "\\u12", "\\uZZZZ"]) {
      expect(unescapeTimingText(written)).toBeUndefined()
    }
  })
})

describe("a Server-Timing header", () => {
  it("writes each metric's duration to a tenth of a ms and its description quoted", () => {
    expect(
      formatServerTiming([
        { name: "api", duration: 20.04, description: 'POST "/users" 201' },
        { name: "rid", description: "req_x\\u2192" },
      ])
    ).toBe('api;dur=20.0;desc="POST \\"/users\\" 201", rid;desc="req_x\\\\u2192"')
  })

  it("is read as browsers read it: fields, spaces, parameters in any order, a token description", () => {
    expect(
      parseServerTiming(
        'courier;dur=30.0, rid ; desc = "req_x" ,api;desc="POST /users 201";dur=20,cdn;desc=HIT;edge=fra'
      )
    ).toEqual([
      { name: "courier", duration: 30, description: "" },
      { name: "rid", description: "req_x" },
      { name: "api", duration: 20, description: "POST /users 201" },
      { name: "cdn", description: "HIT" },
    ])
  })

  it("keeps what is whole of a broken header, and never throws", () => {
    expect(parseServerTiming(',,; ;=, a;dur=x, b;desc="unterminated')).toEqual([
      { name: "a", description: "" },
    ])
    for (let seed = 1; seed <= 300; seed += 1) {
      const header = awkwardText(seeded(seed), 80)
      expect(() => parseServerTiming(header), `seed ${seed}`).not.toThrow()
    }
  })

  it("reads back whatever it wrote", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const next = seeded(seed)
      const metrics = Array.from({ length: below(next, 5) + 1 }, (_, index) => ({
        name: `m${index}`,
        description: escapeTimingText(awkwardText(next, 30)),
      }))
      expect(parseServerTiming(formatServerTiming(metrics)), `seed ${seed}`).toEqual(metrics)
    }
  })
})

const TRACE: CallTrace = {
  site: "proxy",
  rid: "req_mw6bzf0v_0",
  received: {
    method: "POST",
    target: "/api/request?_s=api&_g=users&_m=create",
    headers: ["accept", "content-length", "content-type", "cookie(__Host-courier-demo)", "origin"],
    body: "application/json 86",
  },
  variables: '{"name":"Jane Doe","email":"jane@example.com"}',
  attempts: [{ method: "POST", target: "/users", outcome: "201", at: 7.5, ms: 20 }],
  sent: ["cookie(__Host-courier-demo)", "origin", "x-forwarded-for", "x-visitor-address"],
  answered: ["content-type", "set-cookie(__Host-courier-demo)", "x-ratelimit-limit"],
  chain: [{ name: "log", phase: "wrap", ms: 4.8, added: [] }],
  log: ["middlewareApi:users:getAll → 200 (5ms)"],
  cache: ["miss", "store 30000"],
  status: 201,
  passedBack: ["content-type", "server-timing", "set-cookie(__Host-courier-demo)"],
  cut: 0,
}

/* What the page reads of a trace: the server's header, as the browser parses it. */
const seen = (trace: CallTrace, budget?: number) =>
  traceOfTiming(parseServerTiming(formatServerTiming(traceMetrics(trace, budget))))

describe("a call's trace in Server-Timing", () => {
  it("reaches the page as the server saw it", () => {
    expect(seen(TRACE)).toEqual(TRACE)
  })

  it("keeps each attempt, in order, with when it was sent and how it ended", () => {
    const retried: CallTrace = {
      ...TRACE,
      attempts: [
        { method: "GET", target: "/error/503", outcome: "503", at: 7, ms: 2 },
        { method: "GET", target: "/error/503", outcome: "503", at: 309.1, ms: 1.5 },
        { method: "GET", target: "/slow", outcome: "timeout", at: 912, ms: 400 },
      ],
    }
    expect(seen(retried)?.attempts).toEqual(retried.attempts)
  })

  it(`adds no more than ${TRACE_TIMING_BYTES} bytes, leaving out the least of it first, and says how much`, () => {
    const many = (prefix: string) => Array.from({ length: 24 }, (_, index) => `${prefix}-${index}`)
    const crowded: CallTrace = {
      ...TRACE,
      variables: JSON.stringify({ note: "y".repeat(400) }),
      sent: many("x-sent-header"),
      answered: many("x-answer-header"),
      passedBack: many("x-passed-header"),
      chain: Array.from({ length: 8 }, (_, index) => ({
        name: `link${index}`,
        phase: "wrap",
        ms: 1,
        added: [],
      })),
      log: Array.from({ length: 4 }, () => "a line the middleware wrote ".repeat(8)),
    }
    const header = formatServerTiming(traceMetrics(crowded))
    expect(new TextEncoder().encode(header).length).toBeLessThanOrEqual(TRACE_TIMING_BYTES)
    const read = traceOfTiming(parseServerTiming(header))
    expect(read?.cut).toBeGreaterThan(0)
    expect(read?.log.length).toBeLessThan(crowded.log.length)
    expect(read?.rid).toBe(TRACE.rid)
    expect(read?.received).toEqual(TRACE.received)
    expect(read?.status).toBe(201)
    expect(read?.attempts).toEqual(TRACE.attempts)
  })

  it("cuts a long description with a mark", () => {
    const long = { ...TRACE, variables: JSON.stringify({ note: "x".repeat(1000) }) }
    const read = seen(long)
    expect(read?.variables?.length).toBeLessThanOrEqual(300)
    expect(read?.variables?.endsWith("…")).toBe(true)
  })

  it("is nothing to the page where the header holds no metric of the site's", () => {
    expect(traceOfTiming(parseServerTiming("courier;dur=3.2, cdn;desc=HIT"))).toBeUndefined()
    expect(traceOfTiming([])).toBeUndefined()
  })

  it("is read only as far as the page's limits, skipping what it cannot read", () => {
    const metrics = [
      { name: "in", description: "POST /api/request?_s=api&_m=x" },
      { name: "out", description: "not-a-status" },
      { name: "api", duration: 3, description: "malformed" },
      { name: "vars", description: "x".repeat(401) },
      { name: "log", description: "\\q" },
      ...Array.from({ length: 40 }, () => ({ name: "log", description: "line" })),
    ]
    const read = traceOfTiming(metrics)
    expect(read?.received?.method).toBe("POST")
    expect(read?.status).toBeUndefined()
    expect(read?.attempts).toEqual([])
    expect(read?.variables).toBeUndefined()
    expect(read?.log.length).toBeLessThanOrEqual(32)
  })
})
