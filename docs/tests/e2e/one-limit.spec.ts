/**
 * One limit on each visitor, whichever path their calls take to the
 * examples' backend: from the page through the proxy route, from a Server
 * Action, or from a page the server renders. A visitor who spent their
 * budget on one path is refused on the others, and another visitor who
 * comes through the same edge of the filter is not. Run on the local stand
 * alone: on a deployed site it would spend the budget of the address it
 * runs from.
 */
import type { JSHandle, Page } from "@playwright/test"

import { DEPLOYED, expect, openVisitor, sandbox, test, visitorContext } from "./support/fixtures"

test.skip(DEPLOYED, "spends a minute's budget of the address it runs from")

const REFUSED = "Too many calls from this visitor"
const FORM = "createUser — a Server Action"

/* Addresses of this worker's own for each test, past the workers' own and the limits spec's. */
const addresses = (workerIndex: number, slot: number) => 160 + 4 * workerIndex + 2 * slot

/* Writes through the proxy route from the page until one is refused, then, once the budget let
   one more through, until one is refused again: spent, it stays so for the time a write takes to
   be let through again, not for what was left of that time when the first refusal came. */
function spendWrites(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const statuses: number[] = []
    const untilRefused = async () => {
      for (let write = 0; write < 30; write += 1) {
        const response = await fetch("/api/request?_s=api&_g=users&_m=create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            variables: { name: "Jane Doe", email: "jane@example.com" },
            options: {},
          }),
        })
        statuses.push(response.status)
        if (response.status === 429) return Number(response.headers.get("retry-after"))
      }
      throw new Error("No write was refused")
    }
    const wait = await untilRefused()
    await new Promise((resolve) => setTimeout(resolve, wait * 1000))
    await untilRefused()
    return statuses
  })
}

interface Spending {
  spent: boolean
  stop: boolean
  statuses: Record<number, number>
}

/* Calls through the proxy route from the page, a few at a time, until told to stop: once one is
   refused, the visitor's budget of calls is spent, and the calls go on taking what it refills —
   unhurried, not to busy the stand. */
function spendCalls(page: Page): Promise<JSHandle<Spending>> {
  return page.evaluateHandle(() => {
    const state: Spending = { spent: false, stop: false, statuses: {} }
    const lane = async () => {
      while (!state.stop) {
        const response = await fetch("/api/request?_s=api&_g=users&_m=getAll", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ variables: {}, options: {} }),
        })
        state.statuses[response.status] = (state.statuses[response.status] ?? 0) + 1
        if (response.status === 429) state.spent = true
        if (state.spent) await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }
    for (let lanes = 0; lanes < 4; lanes += 1) void lane()
    return state
  })
}

async function fillForm(page: Page): Promise<void> {
  const form = sandbox(page, FORM)
  await form.getByLabel("name", { exact: true }).fill("Grace Hopper")
  await form.getByLabel("email", { exact: true }).fill("grace@example.com")
}

test("refuses a Server Action's write once the page spent the visitor's writes", async ({
  browser,
  siteAccess,
}, testInfo) => {
  const first = addresses(testInfo.workerIndex, 0)
  const networks = [await openVisitor(first), await openVisitor(first + 1)]
  const contexts = await Promise.all(
    networks.map((network) => visitorContext(browser, siteAccess, network))
  )
  try {
    const [hasty, calm] = await Promise.all(contexts.map((context) => context.newPage()))
    if (hasty === undefined || calm === undefined) throw new Error("No page opened")
    for (const page of [hasty, calm]) {
      await page.goto("/docs/examples/actions")
      await fillForm(page)
    }

    expect((await spendWrites(hasty)).slice(0, 20)).toEqual(Array(20).fill(201))
    await sandbox(hasty, FORM).getByRole("button", { name: "Create" }).click()
    await expect(sandbox(hasty, FORM)).toContainText(REFUSED)

    await sandbox(calm, FORM).getByRole("button", { name: "Create" }).click()
    await expect(sandbox(calm, FORM)).toContainText("grace@example.com")
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
    await Promise.all(networks.map((network) => network.close()))
  }
})

/* Whether the page the server renders at `path`, asked for from the page, shows `text`. */
function renders(page: Page, path: string, text: string): Promise<boolean> {
  return page.evaluate(
    async (asked) => {
      const html = await (await fetch(asked.path)).text()
      return html.includes(asked.text)
    },
    { path, text }
  )
}

test("refuses the pages the server renders and its Server Actions once the page spent the visitor's calls", async ({
  browser,
  siteAccess,
}, testInfo) => {
  const first = addresses(testInfo.workerIndex, 1)
  const networks = [await openVisitor(first), await openVisitor(first + 1)]
  const [visitor, other] = await Promise.all(
    networks.map((network) => visitorContext(browser, siteAccess, network))
  )
  try {
    if (visitor === undefined || other === undefined) throw new Error("No context opened")
    /* One page spends and asks: a page out of sight may have its timers slowed, and its calls with
       them, which would leave the budget refilling faster than it spends. */
    const page = await visitor.newPage()
    await page.goto("/docs/examples/actions")
    const spending = await spendCalls(page)
    await expect.poll(() => spending.evaluate((state) => state.spent)).toBe(true)

    /* A call of the server's goes through only when it comes as the budget refills one, before the
       page's next call takes it: rarely, so a render seldom needs asking for again. */
    await expect.poll(() => renders(page, "/docs/examples/direct", REFUSED)).toBe(true)
    await expect(async () => {
      /* A Server Action that went through empties the form. */
      await fillForm(page)
      await sandbox(page, FORM).getByRole("button", { name: "Create" }).click()
      await expect(sandbox(page, FORM)).toContainText(REFUSED, { timeout: 2_000 })
    }).toPass({ timeout: 20_000 })

    const calm = await other.newPage()
    await calm.goto("/docs/examples/direct")
    await expect(sandbox(calm, "caller.users.getAll()")).toContainText("Carol Williams")
    await expect(calm.getByText(REFUSED)).toHaveCount(0)

    const statuses = await spending.evaluate((state) => {
      state.stop = true
      return state.statuses
    })
    expect(statuses[429]).toBeGreaterThan(0)
  } finally {
    await Promise.all([visitor, other].map((context) => context?.close()))
    await Promise.all(networks.map((network) => network.close()))
  }
})
