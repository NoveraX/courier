import { describe, expect, it } from "vitest";

import { codeMatches, nextCode, scanSource } from "../../src/edit/source-scan";

describe("scanSource", () => {
  it("pairs each bracket with the one that closes it", () => {
    const text = "f({ a: [1, (2)] })";
    const scan = scanSource(text);

    expect(scan?.closer.get(text.indexOf("{"))).toBe(text.indexOf("}"));
    expect(scan?.closer.get(text.indexOf("["))).toBe(text.indexOf("]"));
  });

  it("takes no bracket inside a string, a comment or a regular expression for code", () => {
    const text = `const a = "[" + '{'; // ( not this
/* ] nor this */ const b = /[)\\]]/g; f(a)`;
    const scan = scanSource(text);

    expect(scan).toBeDefined();
    expect(scan?.closer.size).toBe(1);
    expect(scan?.code[text.indexOf('"[')]).toBe(0);
    expect(scan?.code[text.indexOf("( not")]).toBe(0);
  });

  it("reads code inside a template's placeholders, and the template's own text as text", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the scanned file's own template literal
    const text = "const s = `[${fn({ a: 1 })}]`;";
    const scan = scanSource(text);
    const open = text.indexOf("{ a");

    expect(scan?.closer.get(open)).toBe(text.indexOf("}", open));
    expect(scan?.code[text.indexOf("`[") + 1]).toBe(0);
  });

  it("marks the text of strings and templates as literal, and a comment as neither", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the scanned file's own template literal
    const text = '// "a comment"\nconst s = "a string" + `a ${b} template`;';
    const scan = scanSource(text);

    expect(scan?.literal[text.indexOf('"a comment"')]).toBe(0);
    expect(scan?.literal[text.indexOf('"a string"')]).toBe(1);
    expect(scan?.literal[text.indexOf("template`")]).toBe(1);
    expect(scan?.literal[text.indexOf("b}")]).toBe(0);
  });

  it("divides after a value and starts a regular expression after an operator", () => {
    const text = "const x = (a) / 2 / (b); const r = x || /a\\/b/;";

    expect(scanSource(text)?.closer.size).toBe(2);
  });

  it("refuses a file whose brackets do not pair up", () => {
    expect(scanSource("f({ a: [1 })")).toBeUndefined();
    expect(scanSource("f(")).toBeUndefined();
    expect(scanSource("const s = `${a`")).toBeUndefined();
  });

  it("finds matches in code only", () => {
    const scan = scanSource(
      '// export default x\nconst s = "export default";\nexport default {};\n',
    );
    const found = scan ? codeMatches(scan, /export\s+default/g) : [];

    expect(found).toHaveLength(1);
    expect(found[0]?.index).toBe(scan?.text.lastIndexOf("export default"));
  });

  it("skips white space and comments to the next character of code", () => {
    const text = "export default /* the config */ {}";
    const scan = scanSource(text);

    expect(scan ? nextCode(scan, 14) : -1).toBe(text.indexOf("{"));
  });
});
