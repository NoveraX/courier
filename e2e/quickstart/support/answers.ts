import { get } from "node:http";

/*
 * node:http, not fetch: the fetch Node 24.21 ships marks each socket it
 * writes on, and on macOS a socket the server is closing refuses the mark
 * with an error no promise of fetch's catches (setTypeOfService EINVAL) —
 * which ended the check while a dev server restarted.
 */
function statusOf(url: string): Promise<number> {
  return new Promise((done) => {
    const request = get(url, (response) => {
      response.resume();
      done(response.statusCode ?? 0);
    });
    request.setTimeout(10_000, () => request.destroy());
    request.on("error", () => done(0));
  });
}

/**
 * Ask an address until it answers 200, or the time runs out.
 *
 * @param url - The address
 * @param within - How long to keep asking, in milliseconds
 * @returns Whether it answered 200 in time
 * @example
 * ```ts
 * await answers("http://127.0.0.1:7101/users", 120_000);
 * ```
 */
export async function answers(url: string, within: number): Promise<boolean> {
  const until = Date.now() + within;
  while (Date.now() < until) {
    if ((await statusOf(url)) === 200) return true;
    await new Promise((done) => setTimeout(done, 1_000));
  }
  return false;
}

/**
 * Whether an address answers again a moment after it first did: a dev
 * server may restart once just after it starts — fastify-cli's, as its
 * compiler catches up.
 *
 * @param url - The address
 * @returns Whether it answered 200 within a minute
 * @example
 * ```ts
 * await settled("http://localhost:4321/courier");
 * ```
 */
export async function settled(url: string): Promise<boolean> {
  await new Promise((done) => setTimeout(done, 5_000));
  return answers(url, 60_000);
}
