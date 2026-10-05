/**
 * The hero types three calls against the definition beside it. Each frame
 * must show what an editor would at that moment: the completion list while
 * a member is picked, the definition's lines the call comes from, and the
 * type error only once the refused call is typed in full.
 */
import { describe, expect, it } from "vitest"

import { CALLS_FILE, CREATE_STOP, READ_STOP } from "@/site/landing/hero/hero-code"
import { HERO_CYCLE, HERO_REST, heroFrame } from "@/site/landing/hero/hero-frame"

describe("the hero's frames", () => {
  it("starts empty, with the caret on the first call", () => {
    expect(heroFrame(0)).toMatchObject({
      typed: [0, 0, 0],
      caret: 1,
      completion: null,
      refused: false,
    })
  })

  it("stops at `caller.users.` while the completion list moves from getAll to getById", () => {
    expect(heroFrame(READ_STOP).typed[0]).toBe(READ_STOP)
    expect(heroFrame(40)).toMatchObject({ completion: { line: 1, picked: 0 }, lit: { lines: [6] } })
    expect(heroFrame(50)).toMatchObject({
      completion: { line: 1, picked: 1 },
      lit: { lines: [7, 8, 9] },
    })
    expect(heroFrame(55).typed[0]).toBe(READ_STOP)
  })

  it("finishes the read, then shows its type", () => {
    const frame = heroFrame(80)

    expect(frame.typed[0]).toBe(CALLS_FILE[1]?.length)
    expect(frame.hints).toEqual([true, false])
  })

  it("opens a second list at the create and picks it, lighting the create's lines", () => {
    expect(heroFrame(170)).toMatchObject({
      typed: [expect.any(Number), expect.any(Number), CREATE_STOP],
    })
    expect(heroFrame(180)).toMatchObject({
      completion: { line: 7, picked: 2 },
      lit: { lines: [10, 11, 12] },
    })
  })

  it("refuses the create once it is typed, lighting its variables in red", () => {
    const before = heroFrame(213)
    const after = heroFrame(214)

    expect(before.refused).toBe(false)
    expect(after).toMatchObject({ refused: true, caret: null, lit: { lines: [11], tone: "red" } })
    expect(after.typed[2]).toBe(CALLS_FILE[7]?.length)
  })

  it("rests, with motion turned down, on a frame with everything typed and the error shown", () => {
    const rest = heroFrame(HERO_REST)

    expect(HERO_REST).toBeLessThan(HERO_CYCLE)
    expect(rest.typed).toEqual([
      CALLS_FILE[1]?.length,
      CALLS_FILE[4]?.length,
      CALLS_FILE[7]?.length,
    ])
    expect(rest.hints).toEqual([true, true])
    expect(rest.refused).toBe(true)
  })
})
