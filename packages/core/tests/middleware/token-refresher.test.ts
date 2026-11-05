/**
 * A refresh is shared by the calls refused with the token it renews: a
 * call sent with no token refreshes for itself, a refresh is remembered
 * within a bound, and a late call of a token renewed twice takes the
 * newest.
 */
import { describe, expect, it, vi } from "vitest";

import { tokenRefresher } from "../../src/middleware/token-refresher";

describe("tokenRefresher", () => {
  it("refreshes for each call sent with no token, sharing none", async () => {
    let issued = 0;
    const refreshToken = vi.fn(async () => `fresh-${++issued}`);
    const refresher = tokenRefresher(refreshToken);

    const tokens = await Promise.all([
      refresher.renew(undefined, 0),
      refresher.renew(undefined, 0),
    ]);

    expect(tokens).toEqual(["fresh-1", "fresh-2"]);
    expect(refreshToken).toHaveBeenCalledTimes(2);
  });

  it("forgets the oldest refresh past a hundred, so a late call of its token refreshes for itself", async () => {
    const refreshToken = vi.fn(async () => `fresh-${refreshToken.mock.calls.length}`);
    const refresher = tokenRefresher(refreshToken);

    await refresher.renew("user-0", 0);
    for (let user = 1; user <= 100; user++) await refresher.renew(`user-${user}`, 0);
    const late = await refresher.renew("user-0", 0);

    expect(late).toBe("fresh-102");
    expect(refreshToken).toHaveBeenCalledTimes(102);
  });

  it("gives a late call of a token renewed twice the newest token", async () => {
    let issued = 0;
    const refresher = tokenRefresher(async () => `fresh-${++issued}`);

    await refresher.renew("stale", 0);
    await refresher.renew("fresh-1", refresher.generation);

    await expect(refresher.renew("stale", 0)).resolves.toBe("fresh-2");
    expect(issued).toBe(2);
  });
});
