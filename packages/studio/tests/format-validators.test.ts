import { describe, expect, it } from "vitest";

import { primitiveToZod } from "../src/apis/generator/validation-zod";
import { primitiveToValibot } from "../src/apis/generator/validation-valibot";
import { primitiveToArkType } from "../src/apis/generator/validation-arktype";

describe("date-time", () => {
  it("accepts a zone offset", () => {
    /* RFC 3339 allows one, and 18 of the 67 `date-time` examples the
       specifications give carry one — the default form rejected them all. */
    expect(primitiveToZod("string", "date-time")).toBe("z.iso.datetime({ offset: true })");
  });
});

describe("uri", () => {
  it("is not checked, because the format is used loosely", () => {
    /* Three of the 162 `uri` examples in the sample are not absolute URIs;
       rejecting what the API really returns is worse than not checking. */
    expect(primitiveToZod("string", "uri")).toBe("z.string()");
    expect(primitiveToValibot("string", "uri")).toBe("v.string()");
    expect(primitiveToArkType("string", "uri")).toBe('type("string")');
  });
});

describe("the formats that are well defined", () => {
  it("are still checked", () => {
    expect(primitiveToZod("string", "email")).toBe("z.email()");
    expect(primitiveToZod("string", "uuid")).toBe("z.uuid()");
  });
});
