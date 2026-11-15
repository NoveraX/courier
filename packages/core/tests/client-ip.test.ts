/**
 * The per-IP connection cap is only worth as much as the address it counts
 * against. A `Request` carries no peer address, so that address comes from a
 * header the caller writes — unless the application names it.
 */
import { describe, expect, it, vi } from "vitest";

import { createIPTracker, extractClientIP } from "../src/adapter/ws-ip-tracker";

const upgrade = (headers: Record<string, string> = {}): Request =>
  new Request("http://localhost/api/ws", { headers });

describe("which hop of the forwarding chain is believed", () => {
  /** A proxy appends, so the rightmost entry is the one it observed. */
  it("reads the hop the nearest proxy wrote, not the one the caller sent", () => {
    expect(extractClientIP(upgrade({ "X-Forwarded-For": "1.2.3.4, 203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("reads a single hop unchanged", () => {
    expect(extractClientIP(upgrade({ "X-Forwarded-For": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("tolerates whitespace and a trailing separator", () => {
    expect(extractClientIP(upgrade({ "X-Forwarded-For": "1.2.3.4 ,  203.0.113.7 " }))).toBe(
      "203.0.113.7",
    );
    expect(extractClientIP(upgrade({ "X-Forwarded-For": "203.0.113.7," }))).toBe("203.0.113.7");
  });

  it("does not believe a header of a proxy's own that any caller can write", () => {
    expect(extractClientIP(upgrade({ "CF-Connecting-IP": "198.51.100.9" }))).toBe("0.0.0.0");
    expect(extractClientIP(upgrade({ "X-Real-IP": "198.51.100.9" }))).toBe("0.0.0.0");
  });

  it("has an answer when the request says nothing", () => {
    expect(extractClientIP(upgrade())).toBe("0.0.0.0");
  });
});

describe("an application that knows the address is believed over any header", () => {
  it("uses the resolver even when a header disagrees", () => {
    const resolve = vi.fn().mockReturnValue("203.0.113.7");

    expect(extractClientIP(upgrade({ "X-Forwarded-For": "1.2.3.4" }), resolve)).toBe("203.0.113.7");
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("falls back to the headers when the resolver has no answer", () => {
    expect(extractClientIP(upgrade({ "X-Forwarded-For": "203.0.113.7" }), () => undefined)).toBe(
      "203.0.113.7",
    );
  });
});

describe("what the cap is worth against a caller that varies the header", () => {
  const forged = (i: number) => `10.0.0.${i}, 203.0.113.7`;

  it("counts a forging caller against the address the proxy saw", () => {
    const tracker = createIPTracker(50);
    let accepted = 0;

    for (let i = 0; i < 1000; i += 1) {
      if (tracker.acquire(extractClientIP(upgrade({ "X-Forwarded-For": forged(i) })))) {
        accepted += 1;
      }
    }

    expect(accepted).toBe(50);
  });

  /** Claiming a victim's address must not spend the victim's quota. */
  it("does not let one caller fill another's quota", () => {
    const tracker = createIPTracker(2);
    const victim = "203.0.113.7";

    for (let i = 0; i < 10; i += 1) {
      tracker.acquire(extractClientIP(upgrade({ "X-Forwarded-For": `${victim}, 198.51.100.9` })));
    }

    expect(tracker.acquire(victim)).toBe(true);
  });

  it("counts the addresses of one IPv6 /64 as one caller, as the proxy's limit does", () => {
    const tracker = createIPTracker(2);

    expect(tracker.acquire("2001:db8:0:7::1")).toBe(true);
    expect(tracker.acquire("2001:db8:0:7:aaaa::2")).toBe(true);
    expect(tracker.acquire("2001:db8:0:7:ffff:ffff:ffff:fffe")).toBe(false);
    expect(tracker.acquire("2001:db8:0:8::1")).toBe(true);
    tracker.release("2001:db8:0:7::1");
    expect(tracker.acquire("[2001:db8:0:7::3]:443")).toBe(true);
    expect(tracker.acquire("a caller the resolver names")).toBe(true);
  });

  it("releases the count when a connection closes", () => {
    const tracker = createIPTracker(1);

    expect(tracker.acquire("203.0.113.7")).toBe(true);
    expect(tracker.acquire("203.0.113.7")).toBe(false);
    tracker.release("203.0.113.7");
    expect(tracker.acquire("203.0.113.7")).toBe(true);
  });
});
