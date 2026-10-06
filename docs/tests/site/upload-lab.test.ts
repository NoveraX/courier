/**
 * The upload guide's lab: its numbers and chart say what the two
 * bars did, the run it shows at rest is one smoothProgress could have
 * drawn, and the site's lab route reads an upload at the pace a page names
 * — and refuses what a page would not send.
 */
import { afterEach, describe, expect, it } from "vitest"

import { LAB_SLOTS, takeLabSlot } from "@/app/api/upload-lab/lab-slots"
import { LabRefusal, readPaced } from "@/app/api/upload-lab/paced-read"
import { POST } from "@/app/api/upload-lab/route"
import {
  chartScale,
  chartSpan,
  grownSpan,
  linePath,
  startSpan,
  stepPath,
  timeTicks,
} from "@/site/upload-lab/lab-geometry"
import { RECORDED_RUN } from "@/site/upload-lab/lab-recorded"
import { LAB_PACE_HEADER, MB } from "@/site/upload-lab/lab-settings"
import { labStats, reachedAt, seconds } from "@/site/upload-lab/lab-stats"

const BOX = { width: 552, height: 240, left: 40, right: 12, top: 10, bottom: 30 }

function body(bytes: number, chunk = 16 * 1024): ReadableStream<Uint8Array> {
  let left = bytes
  return new ReadableStream({
    pull(controller) {
      if (left <= 0) return controller.close()
      const size = Math.min(chunk, left)
      left -= size
      controller.enqueue(new Uint8Array(size))
    },
  })
}

function upload(bytes: number, headers: Record<string, string> = {}): Request {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    body: body(bytes),
    duplex: "half",
    headers: {
      "content-length": String(bytes),
      "sec-fetch-site": "same-origin",
      [LAB_PACE_HEADER]: "4",
      ...headers,
    },
  }
  return new Request("http://localhost/api/upload-lab", init)
}

describe("what the lab says about a bar", () => {
  it("counts its moves, its biggest jump from 0, and its longest wait between moves", () => {
    expect(
      labStats([
        [100, 0.2],
        [210, 0.5],
        [300, 1],
      ])
    ).toEqual({ count: 3, step: 0.5, wait: 110 })
    expect(
      labStats([
        [120, 0.25],
        [150, 0.3],
      ])
    ).toEqual({ count: 2, step: 0.25, wait: 30 })
    expect(labStats([])).toEqual({ count: 0, step: 0, wait: 0 })
  })

  it("names when a share was first reached, and writes times as seconds", () => {
    expect(
      reachedAt(
        [
          [100, 0.4],
          [250, 1],
          [260, 1],
        ],
        1
      )
    ).toBe(250)
    expect(reachedAt([[100, 0.4]], 1)).toBeNull()
    expect(seconds(1357)).toBe("1.36 s")
    expect(seconds(12_340)).toBe("12.3 s")
  })
})

describe("the lab's chart", () => {
  it("spans the run rounded up, and marks its axis at even steps", () => {
    expect(chartSpan(1663)).toBe(2000)
    expect(chartSpan(200)).toBe(1000)
    expect(chartSpan(4200)).toBe(5000)
    expect(timeTicks(2000)).toEqual([0, 500, 1000, 1500, 2000])
    expect(timeTicks(8000)).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000])
    expect(timeTicks(2500, 250)).toEqual([0, 1000, 2000])
    expect(timeTicks(2500, 1100)).toEqual([0, 500, 1000, 1500, 2000, 2500])
  })

  it("spans a run from its start with room past the pace's time, and only ever widens", () => {
    expect(startSpan(2000)).toBe(2500)
    expect(startSpan(8000)).toBe(10_000)
    expect(grownSpan(2500, 2020)).toBe(2500)
    expect(grownSpan(2500, 2400)).toBe(3000)
    expect(grownSpan(10_000, 8030)).toBe(10_000)
    expect(grownSpan(3000, 100)).toBe(3000)
  })

  it("draws the reports as steps and the smoothed moves as a line, within the box", () => {
    const scale = chartScale(BOX, 1000)

    expect(scale.x(0)).toBe(40)
    expect(scale.x(1000)).toBe(540)
    expect(scale.y(1)).toBe(10)
    expect(stepPath([[500, 0.5]], 800, scale)).toBe("M40 210H290V110H440")
    expect(
      linePath(
        [
          [0, 0],
          [1000, 1],
        ],
        scale,
        false
      )
    ).toBe("M40 210L540 10")
    expect(
      linePath(
        [
          [0, 0],
          [1000, 1],
        ],
        scale,
        true
      )
    ).toBe("M40 210L540 10V210H40Z")
    expect(stepPath([], 800, scale)).toBe("")
  })
})

describe("the run the lab shows at rest", () => {
  it("is a whole run: reports in order up to 100%, and an answer after them", () => {
    const { reported, smoothed, answeredAt } = RECORDED_RUN

    expect(reported.length).toBeGreaterThan(5)
    expect(reported.at(-1)?.[1]).toBe(1)
    expect(smoothed.at(-1)?.[1]).toBe(1)
    expect(reported.every(([ms], at) => at === 0 || ms > (reported[at - 1]?.[0] ?? 0))).toBe(true)
    expect(answeredAt).toBeGreaterThan(reported.at(-1)?.[0] ?? Number.POSITIVE_INFINITY)
    expect(RECORDED_RUN.span).toBe(startSpan((RECORDED_RUN.size / RECORDED_RUN.pace) * 1000))
    expect(RECORDED_RUN.span).toBeGreaterThan(answeredAt ?? Number.POSITIVE_INFINITY)
  })

  it("never shows the smoothed bar ahead of what the browser had reported, nor going back", () => {
    const { reported, smoothed } = RECORDED_RUN
    const reportedBy = (ms: number) => reported.filter(([at]) => at <= ms).at(-1)?.[1] ?? 0

    expect(smoothed.every(([ms, share]) => share <= reportedBy(ms) + 1e-9)).toBe(true)
    expect(
      smoothed.every(([, share], at) => at === 0 || share >= (smoothed[at - 1]?.[1] ?? 0))
    ).toBe(true)
    expect(labStats(smoothed).step).toBeLessThan(labStats(reported).step)
  })
})

describe("the site's lab route", () => {
  const held: Array<() => void> = []
  afterEach(() => {
    for (const release of held.splice(0)) release()
  })

  it("reads an upload at the pace named and answers what it read", async () => {
    const response = await POST(upload(256 * 1024, { [LAB_PACE_HEADER]: "1" }))
    const answer = (await response.json()) as { received: number; ms: number }

    expect(response.status).toBe(200)
    expect(answer.received).toBe(256 * 1024)
    expect(answer.ms).toBeGreaterThanOrEqual(200)
  })

  it("refuses an upload from another site, one naming no pace or a pace it does not read at", async () => {
    expect((await POST(upload(1024, { "sec-fetch-site": "cross-site" }))).status).toBe(403)
    expect((await POST(upload(1024, { [LAB_PACE_HEADER]: "" }))).status).toBe(400)
    expect((await POST(upload(1024, { [LAB_PACE_HEADER]: "3" }))).status).toBe(400)
  })

  it("refuses an upload with no length, or longer than the largest file", async () => {
    expect((await POST(upload(1024, { "content-length": "" }))).status).toBe(411)
    expect((await POST(upload(17 * MB))).status).toBe(413)
  })

  it("stops reading an upload that sends more than it may, or takes longer than it waits", async () => {
    const tooMuch = readPaced(body(256 * 1024), {
      bytesPerSecond: 64 * MB,
      limit: 64 * 1024,
      deadline: 5000,
    })
    const tooSlow = readPaced(body(256 * 1024), {
      bytesPerSecond: 64 * 1024,
      limit: MB,
      deadline: 60,
    })

    await expect(tooMuch).rejects.toEqual(expect.objectContaining({ status: 413 }))
    await expect(tooSlow).rejects.toBeInstanceOf(LabRefusal)
    await expect(tooSlow).rejects.toEqual(expect.objectContaining({ status: 408 }))
  })

  it("answers busy, with when to try again, while every slot reads another upload", async () => {
    for (let at = 0; at < LAB_SLOTS; at += 1) {
      const release = takeLabSlot()
      if (release) held.push(release)
    }

    const response = await POST(upload(1024))

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("5")
  })
})
