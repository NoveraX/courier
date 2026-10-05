import { describe, expect, it } from "vitest";

import { createKeptBodies } from "../src/studio/kept-bodies";

const whole = (text: string) => ({ value: "part", whole: { text, bytes: text.length } });

describe("createKeptBodies", () => {
  it("keeps the whole of a body an event carried a part of", () => {
    const bodies = createKeptBodies();

    bodies.keep("req_1", "response", whole("[1,2,3]"));

    expect(bodies.textOf("req_1", "response")).toBe("[1,2,3]");
    expect(bodies.textOf("req_1", "request")).toBeUndefined();
  });

  it("keeps nothing for a body the event carried whole", () => {
    const bodies = createKeptBodies();

    bodies.keep("req_1", "response", { value: [1, 2, 3] });

    expect(bodies.textOf("req_1", "response")).toBeUndefined();
  });

  it("lets the oldest bodies go once they hold more than the limit", () => {
    const bodies = createKeptBodies(20);

    bodies.keep("req_1", "response", whole("a".repeat(8)));
    bodies.keep("req_2", "response", whole("b".repeat(8)));
    bodies.keep("req_3", "response", whole("c".repeat(8)));

    expect(bodies.textOf("req_1", "response")).toBeUndefined();
    expect(bodies.textOf("req_2", "response")).toBe("b".repeat(8));
    expect(bodies.textOf("req_3", "response")).toBe("c".repeat(8));
  });

  it("does not keep a body larger than the limit, nor let others go for it", () => {
    const bodies = createKeptBodies(20);
    bodies.keep("req_1", "response", whole("a".repeat(8)));

    bodies.keep("req_2", "response", whole("b".repeat(21)));

    expect(bodies.textOf("req_1", "response")).toBe("a".repeat(8));
    expect(bodies.textOf("req_2", "response")).toBeUndefined();
  });
});
