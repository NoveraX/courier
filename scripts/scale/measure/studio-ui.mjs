/**
 * Studio's pages on the enterprise project, in a real browser: how soon the
 * Explorer shows a thousand endpoints and the Timeline the requests Studio
 * kept, and what the page's main thread and memory go through while an
 * attached app's traffic streams in; what the page is sent of the mocks as
 * it opens, and how soon the Mocks section's Store tab shows a mock's
 * records, which only a page that shows them is sent. The page is opened
 * with Studio's token, read from the project and never printed.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { measured } from "./metrics.mjs";

const require = createRequire(import.meta.url);

/**
 * Open Studio's pages and measure them, with live traffic made by `traffic`.
 *
 * @param {{ dir: string, endpoints: number }} fixture - The project
 * @param {{ url: string }} studio - The running Studio
 * @param {() => Promise<void>} traffic - Makes the attached app's traffic while the Timeline is open
 * @returns {Promise<import("./metrics.mjs").Measured[]>} The figures
 * @example
 * ```js
 * await measureStudioUi(fixture, studio, () => callThroughTheApp(5000));
 * ```
 */
export async function measureStudioUi(fixture, studio, traffic) {
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(watchLongTasks);
    const frames = countFrames(page);
    const token = readFileSync(join(fixture.dir, ".courier", "studio-token"), "utf8").trim();
    const opened = performance.now();
    await page.goto(`${studio.url}/#token=${token}`);
    await page.getByRole("link", { name: "Explorer" }).first().waitFor();
    const shellMs = performance.now() - opened;
    const timeline = await timed(page, "Timeline", /\/timeline/, () =>
      page
        .locator("main")
        .getByText(/^core\.\w+\.\w+$/)
        .first()
        .waitFor({ timeout: 60_000 }),
    );
    const mockStates = frames.mockStates;
    const onTimeline = await whileTrafficFlows(page, frames, traffic);
    const explorer = await timed(page, "Explorer", /\/explorer/, () =>
      page.getByRole("list", { name: "Legend" }).waitFor({ timeout: 60_000 }),
    );
    const onExplorer = await whileTrafficFlows(page, frames, traffic);
    const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
    const store = await mockStore(page, frames);
    return [
      measured("ui.shell", shellMs, "ms", 3_000, { note: "page load to Studio's navigation" }),
      measured("ui.timeline", timeline, "ms", 3_000, {
        note: "the requests Studio kept, replayed",
      }),
      ...liveFigures("ui.timelineLive", onTimeline),
      measured("ui.explorer", explorer, "ms", 3_000, {
        note: `the graph of ${fixture.endpoints} endpoints`,
      }),
      ...liveFigures("ui.explorerLive", onExplorer),
      measured("ui.heap", heap / 2 ** 20, "MB", 300, {
        note: "the page's JavaScript heap with the Explorer open",
      }),
      measured("ui.mockStates", mockStates / 1024, "KB", 2_048, {
        note: "the mocks' states a page is sent as it opens: no records",
      }),
      measured("ui.mockStore", store.ms, "ms", 1_000, {
        note: `the Store tab, ${(store.bytes / 2 ** 20).toFixed(1)} MB of the mock's records asked for as the Mocks section opened`,
      }),
    ];
  } finally {
    await browser.close();
  }
}

/* What the page went through while the attached app's traffic streamed in. */
async function whileTrafficFlows(page, frames, traffic) {
  await page.evaluate(() => window.__longTasks.splice(0));
  const before = { ...frames };
  const begun = performance.now();
  await traffic();
  const tasks = await page.evaluate(() => window.__longTasks.splice(0));
  const seconds = (performance.now() - begun) / 1000;
  return {
    tasks,
    seconds,
    messages: frames.count - before.count,
    bytes: frames.bytes - before.bytes,
  };
}

function liveFigures(name, { tasks, seconds, messages, bytes }) {
  const busy = tasks.reduce((sum, ms) => sum + ms, 0) / 1000 / seconds;
  return [
    measured(`${name}.busy`, busy * 100, "%", 50, {
      note: `main thread in tasks over 50 ms, ${seconds.toFixed(1)} s of traffic`,
    }),
    measured(`${name}.longestTask`, Math.max(0, ...tasks), "ms", 250),
    measured(`${name}.messages`, messages / seconds, "msg/s", 5_000, {
      note: `${(bytes / 2 ** 20).toFixed(1)} MB of live events reached the page`,
    }),
  ];
}

/* The Mocks section, a moment, as a person takes, then its Store tab: until the mock's records show. */
async function mockStore(page, frames) {
  await settled(frames);
  await page.getByRole("link", { name: "Mocks" }).first().click();
  await page.waitForURL(/\/mocks/);
  const before = frames.bytes;
  await page
    .getByText(/records?$/)
    .first()
    .waitFor({ timeout: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const ms = await timed(page, "Store", /\/mocks\/store/, () =>
    page.getByRole("region", { name: /^Collection / }).waitFor({ timeout: 60_000 }),
  );
  return { ms, bytes: frames.bytes - before };
}

/* Until the page has been sent nothing for half a second: on a fast machine
   Studio is still sending the events of traffic that has ended, and what is
   timed next would be timed while the page takes them in. */
async function settled(frames) {
  let seen = -1;
  for (let waited = 0; waited < 60_000 && frames.count !== seen; waited += 500) {
    seen = frames.count;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/* Every WebSocket frame the page receives, counted with its bytes, and those of the mocks' states. */
function countFrames(page) {
  const frames = { count: 0, bytes: 0, mockStates: 0 };
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      const size = typeof payload === "string" ? payload.length : payload.byteLength;
      frames.count += 1;
      frames.bytes += size;
      if (typeof payload === "string" && payload.includes('"type":"mock:server:connect"')) {
        frames.mockStates += size;
      }
    });
  });
  return frames;
}

/* Open a page by its link and time how long until it is there and `shown` holds. */
async function timed(page, link, path, shown) {
  const begun = performance.now();
  await page.getByRole("link", { name: link }).first().click();
  await page.waitForURL(path);
  await shown();
  return performance.now() - begun;
}

/* Runs in the page: every task that held the main thread past 50 ms. */
function watchLongTasks() {
  window.__longTasks = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__longTasks.push(entry.duration);
  }).observe({ type: "longtask", buffered: true });
}
