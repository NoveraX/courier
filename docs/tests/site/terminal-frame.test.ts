/**
 * The agent's terminal session, frame by frame: the person types the
 * request and sends it; the agent works, says what it will do and calls the
 * first tool, which runs through the server's middleware before it is
 * answered; the second tool waits on the server's question, answered safe
 * choice first and then confirmed, and only then runs; the reply streams
 * last. A reader who asked for less motion sees it finished.
 */
import { describe, expect, it } from "vitest"

import { SESSION_PROMPT, SESSION_REPLY } from "@/site/landing/agents/session-script"
import {
  TERMINAL_LINES,
  TERMINAL_STILL,
  TERMINAL_TICKS,
  terminalFrame,
} from "@/site/landing/agents/terminal-script"

describe("the agent's terminal session", () => {
  it("types the request into the input, then sends it and works before it says anything", () => {
    expect(terminalFrame(0)).toMatchObject({ typed: 0, sent: false, working: false })
    expect(terminalFrame(16).typed).toBe(20)
    expect(terminalFrame(31)).toMatchObject({ typed: SESSION_PROMPT.length, sent: false })
    expect(terminalFrame(34)).toMatchObject({ sent: true, working: true, said: [0, 0, 0] })
    expect(terminalFrame(41)).toMatchObject({ working: false, said: [4, 0, 0] })
  })

  it("answers the first call once it has run through every middleware, the second only after the person confirms", () => {
    expect(terminalFrame(47).calls).toEqual(["unmade", "unmade"])
    expect(terminalFrame(48).calls).toEqual(["waiting", "unmade"])
    expect(terminalFrame(52).calls[0]).toBe(1)
    expect(terminalFrame(61).calls[0]).toBe("done")

    expect(terminalFrame(80)).toMatchObject({ calls: ["done", "waiting"], confirm: "hidden" })
    expect(terminalFrame(85)).toMatchObject({ calls: ["done", "waiting"], confirm: "decline" })
    expect(terminalFrame(93)).toMatchObject({ calls: ["done", "waiting"], confirm: "confirm" })
    expect(terminalFrame(99)).toMatchObject({ calls: ["done", 0], confirm: "confirmed" })
    expect(terminalFrame(111).calls[1]).toBe("done")
  })

  it("streams the reply after the last answer, and stands finished for less motion", () => {
    expect(terminalFrame(115).said[2]).toBe(0)
    expect(terminalFrame(TERMINAL_STILL)).toMatchObject({
      typed: SESSION_PROMPT.length,
      sent: true,
      working: false,
      said: TERMINAL_LINES.map((line) => line.length),
      calls: ["done", "done"],
      confirm: "confirmed",
    })
    expect(TERMINAL_LINES.at(-1)).toBe(SESSION_REPLY)
  })

  it("loops, turning its spinner a quarter each tick", () => {
    expect(terminalFrame(TERMINAL_TICKS)).toEqual(terminalFrame(0))
    expect([0, 1, 2, 3, 4].map((tick) => terminalFrame(tick).spinner)).toEqual([
      "-",
      "\\",
      "|",
      "/",
      "-",
    ])
  })
})
