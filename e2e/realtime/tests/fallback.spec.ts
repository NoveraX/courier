/**
 * A page's realtime connection in a real browser, carried by what gets
 * through the entry in front of the server: a WebSocket where one does, an
 * HTTP stream where the entry refuses the upgrade, polls where it holds
 * answers back as well. On each the connection is what it is on a
 * WebSocket: it hears the room's snapshot first, then each event once and
 * in order; it sends; it proves who it is again when the server asks; and
 * it ends, or comes back where it stood, as a socket's does for each code
 * the server closes with. A tab loaded again starts on the transport it
 * fell to, and once a WebSocket gets through again the connection climbs
 * back to it, with nothing lost or doubled.
 */
import { expect, type Page, test } from "@playwright/test";

import { type EntryMode, type Stand, startStand } from "../support/stand";
import type { Heard } from "../support/terms";

/* Each way the entry treats a WebSocket, and what then carries the page's connections. */
const WAYS: readonly { mode: EntryMode; transport: string; where: string }[] = [
  { mode: "pass", transport: "websocket", where: "where a WebSocket gets through" },
  { mode: "refuse", transport: "stream", where: "where the entry refuses WebSocket" },
  { mode: "hold", transport: "poll", where: "where the entry also holds answers back" },
];

/* Every code the server closes a connection with, by what a socket's connection does on it. */
const ENDS = [1000];
const COMES_BACK = [1001, 1009, 1011, 1013, 4408];
/* 4401 among them: its credentials are asked for once more, and, unchanged, not sent. */
const STOPS = [
  1002, 1003, 1007, 1008, 4000, 4099, 4400, 4401, 4403, 4404, 4409, 4413, 4421, 4422, 4429,
];

/* Whether each event came once, none missed between the first and the last. */
function unbroken(ns: readonly number[]): boolean {
  return ns.every((n, i) => i === 0 || n === (ns[i - 1] ?? Number.NaN) + 1);
}

for (const way of WAYS) {
  test.describe(way.where, () => {
    test.describe.configure({ mode: "serial" });

    let stand: Stand;
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      stand = await startStand(way.mode);
      page = await browser.newPage();
      await page.goto(stand.page);
      await page.waitForFunction(() => window.realtime !== undefined);
    });

    test.afterAll(async () => {
      await page?.close();
      await stand?.stop();
    });

    const heard = (id: number): Promise<Heard> =>
      page.evaluate((connection) => window.realtime.heard(connection), id);

    const close = (id: number): Promise<void> =>
      page.evaluate((connection) => window.realtime.close(connection), id);

    /* A connection the page opened as `userId`, once its subscription is open on this way's transport. */
    async function opened(userId: string): Promise<number> {
      const id = await page.evaluate(([url, user]) => window.realtime.open(url, user), [
        stand.url,
        userId,
      ] as const);
      await expect
        .poll(() => heard(id), { message: `${userId} subscribed` })
        .toMatchObject({ phase: "open", transport: way.transport, opens: [false] });
      return id;
    }

    /* Wait for `count` events more than `id` has heard, then say what it heard. */
    async function further(id: number, count: number): Promise<Heard> {
      const from = (await heard(id)).ns.length;
      await expect
        .poll(async () => (await heard(id)).ns.length)
        .toBeGreaterThanOrEqual(from + count);
      return heard(id);
    }

    test(`subscribes on a ${way.transport}, hears the snapshot first and each event once, in order, and sends on it`, async () => {
      const id = await opened("first");
      const before = await further(id, 20);
      await page.evaluate((connection) => window.realtime.send(connection, "hi"), id);

      await expect.poll(async () => (await heard(id)).echoes).toEqual(["hi"]);
      const after = await further(id, 5);
      expect(before.first).toEqual({ snapshot: true });
      expect(after.twice).toBe(0);
      expect(unbroken(after.ns)).toBe(true);
      expect(after.transports).toEqual([way.transport]);
      await close(id);
    });

    test(`proves who it is again on a ${way.transport} when the server asks, and fails with 4401 once refused`, async () => {
      const id = await opened("renewing");
      const before = await heard(id);

      await stand.connections.requireAuth({ meta: { userId: "renewing" } }, { timeoutMs: 5000 });
      await expect.poll(() => stand.reauths.filter((user) => user === "renewing")).toHaveLength(1);
      const renewed = await further(id, 10);
      expect(renewed).toMatchObject({ phase: "open", asked: before.asked + 1, opens: [false] });
      expect(unbroken(renewed.ns)).toBe(true);

      await page.evaluate((connection) => window.realtime.setToken(connection, "revoked"), id);
      await stand.connections.requireAuth({ meta: { userId: "renewing" } }, { timeoutMs: 5000 });
      await expect.poll(() => heard(id)).toMatchObject({ phase: "failed", code: 4401 });
    });

    test(`gives way on a ${way.transport} to a newer connection of its user, with 4409`, async () => {
      const older = await opened("twin");
      const newer = await opened("twin");

      await expect.poll(() => heard(older)).toMatchObject({ phase: "failed", code: 4409 });
      expect(await further(newer, 5)).toMatchObject({ phase: "open", transport: way.transport });
      await close(newer);
    });

    test(`ends on a ${way.transport} as a socket's connection ends, for every code the server closes with`, async () => {
      test.setTimeout(120_000);
      for (const code of [...ENDS, ...COMES_BACK, ...STOPS]) {
        const userId = `closed-${code}`;
        const id = await opened(userId);
        await stand.connections.disconnect(
          { meta: { userId } },
          { code, reason: `Closed with ${code}` },
        );

        const outcome = ENDS.includes(code)
          ? { phase: "closed" }
          : COMES_BACK.includes(code)
            ? { phase: "open", transport: way.transport, opens: [false, true] }
            : { phase: "failed", code };
        await expect
          .poll(() => heard(id), { message: `closed with ${code}` })
          .toMatchObject(outcome);
        if (COMES_BACK.includes(code)) {
          const back = await further(id, 5);
          expect(back.twice, `${code}: twice`).toBe(0);
          expect(unbroken(back.ns), `${code}: unbroken`).toBe(true);
        }
        await close(id);
      }
    });

    /* Where nothing falls back, nothing is kept and there is nothing to climb back from. */
    if (way.transport !== "websocket") {
      test(`starts on the ${way.transport} its tab fell to once the page loads again, with no WebSocket first`, async () => {
        await page.reload();
        await page.waitForFunction(() => window.realtime !== undefined);
        const upgrades = stand.upgrades();

        const id = await opened("reloaded");

        expect(stand.upgrades()).toBe(upgrades);
        await close(id);
      });

      test(`climbs back from a ${way.transport} to a WebSocket once one gets through, nothing lost or doubled`, async () => {
        test.setTimeout(90_000);
        const id = await opened("climbing");

        stand.setMode("pass");

        await expect
          .poll(() => heard(id), { timeout: 45_000 })
          .toMatchObject({ phase: "open", transports: [way.transport, "websocket"] });
        const back = await further(id, 10);
        expect(back.opens).toEqual([false, true]);
        expect(back.twice).toBe(0);
        expect(unbroken(back.ns)).toBe(true);
        await close(id);
      });
    }
  });
}
