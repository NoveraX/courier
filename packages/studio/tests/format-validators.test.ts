import { describe, expect, it } from "vitest";
import { primitiveToArkType } from "../src/apis/generator/validation-arktype";
import { primitiveToValibot } from "../src/apis/generator/validation-valibot";
import { primitiveToZod } from "../src/apis/generator/validation-zod";

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

describe("email", () => {
  it("is not checked, because an API hides an address as an empty string", () => {
    /* Gitea answers a repository with its owner's `email: ""` when the owner
       keeps it private; a checked address refused the whole answer. */
    expect(primitiveToZod("string", "email")).toBe("z.string()");
    expect(primitiveToValibot("string", "email")).toBe("v.string()");
    expect(primitiveToArkType("string", "email")).toBe('type("string")');
  });
});

describe("the formats that are well defined", () => {
  it("are still checked", () => {
    expect(primitiveToZod("string", "uuid")).toBe("z.uuid()");
    expect(primitiveToValibot("string", "uuid")).toBe("v.pipe(v.string(), v.uuid())");
  });
});
