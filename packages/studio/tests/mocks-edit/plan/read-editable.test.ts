import { describe, expect, it } from "vitest";
import { MocksEditRefusal } from "../../../src/server/mocks-edit/mocks-edit-refusal";
import { readEditable } from "../../../src/server/mocks-edit/plan/read-editable";

function refusalOf(text: string): MocksEditRefusal {
  try {
    readEditable("courier.mocks.ts", text);
  } catch (err) {
    if (err instanceof MocksEditRefusal) return err;
    throw err;
  }
  throw new Error("readEditable did not refuse");
}

describe("readEditable", () => {
  it("reads the mocks object and its keys", () => {
    const file = readEditable("courier.mocks.ts", "export default {\n  users: 1,\n};\n");

    expect(file.located.kind).toBe("object");
    expect(file.literalKeys).toEqual(["users"]);
    expect(file.parsed.fileName).toBe("courier.mocks.ts");
  });

  it("reads an empty file as one without a default export", () => {
    const file = readEditable("courier.mocks.ts", "");

    expect(file.located).toEqual({ kind: "absent" });
    expect(file.literalKeys).toEqual([]);
  });

  it("refuses a file that does not parse, with oxc's first message and its line", () => {
    const refusal = refusalOf("\n\nexport default {");

    expect(refusal.code).toBe("PARSE_ERROR");
    expect(refusal.message).toBe(
      "courier.mocks.ts does not parse: Expected `}` but found `EOF` (line 3)",
    );
  });

  it("refuses a CommonJS export, naming the form and its line", () => {
    const refusal = refusalOf("const a = 1;\n\nmodule.exports = a;\n");

    expect(refusal.code).toBe("MOCKS_COMMONJS");
    expect(refusal.message).toBe(
      "courier.mocks.ts exports with module.exports (line 3); Studio edits only a mocks file that is an ES module.",
    );
  });

  it("refuses in order: a parse error, then CommonJS, then the object", () => {
    expect(refusalOf("module.exports = {\n").code).toBe("PARSE_ERROR");
    expect(refusalOf("module.exports = {};\nexport default { ...a };\n").code).toBe(
      "MOCKS_COMMONJS",
    );
    expect(refusalOf("export default { ...a, search: 1 };\n").code).toBe("MOCKS_KEYS_HIDDEN");
  });
});
