import { describe, expect, it } from "vitest";
import { bodyHash } from "../../src/server/import-files/body-hash";
import { readGeneratedFile, signGeneratedFile } from "../../src/server/import-files/generated-header";

const BODY = 'import { defineApi } from "@noverax/courier/define";\n\nexport const pets = defineApi({});\n';

describe("signGeneratedFile", () => {
  it("heads the body with the import's name and the body's hash, and a note", () => {
    const content = signGeneratedFile("pets", BODY);

    const [first, second, ...rest] = content.split("\n");
    expect(JSON.parse(first?.slice("// @courier-generated ".length) ?? "")).toEqual({
      import: "pets",
      sha256: bodyHash(BODY),
    });
    expect(second).toBe(
      "// Courier Studio wrote this file. It keeps your edits to endpoints when it updates the file.",
    );
    expect(rest.join("\n")).toBe(BODY);
  });
});

describe("readGeneratedFile", () => {
  it("gives back the header and exactly the body that was signed", () => {
    const { header, body } = readGeneratedFile(signGeneratedFile("pets", BODY));

    expect(header).toEqual({ import: "pets", sha256: bodyHash(BODY) });
    expect(body).toBe(BODY);
  });

  it("reads a file checked out with CRLF line endings as untouched", () => {
    const crlf = signGeneratedFile("pets", BODY).replaceAll("\n", "\r\n");

    const { header, body } = readGeneratedFile(crlf);

    expect(header?.sha256).toBe(bodyHash(body));
  });

  it("tells an edited body by its hash", () => {
    const edited = signGeneratedFile("pets", BODY).replace("defineApi({})", "defineApi({ baseURL: 'x' })");

    const { header, body } = readGeneratedFile(edited);

    expect(header?.sha256).not.toBe(bodyHash(body));
  });

  it("treats a file without a well-formed header as all body", () => {
    for (const content of [
      BODY,
      `// @courier-generated not json\n${BODY}`,
      `// @courier-generated {"import":"pets","sha256":"short"}\n${BODY}`,
      `// @courier-generated {"import":3,"sha256":"${"a".repeat(64)}"}\n${BODY}`,
    ]) {
      expect(readGeneratedFile(content)).toEqual({ header: null, body: content });
    }
  });

  it("keeps a second line the user changed as part of the body", () => {
    const signed = signGeneratedFile("pets", BODY).replace("Courier Studio wrote", "We wrote");

    const { header, body } = readGeneratedFile(signed);

    expect(header?.import).toBe("pets");
    expect(body.startsWith("// We wrote this file.")).toBe(true);
  });
});

describe("bodyHash", () => {
  it("is the same for LF and CRLF line endings and differs for other content", () => {
    expect(bodyHash("a\r\nb\r\n")).toBe(bodyHash("a\nb\n"));
    expect(bodyHash("a\nb\n")).not.toBe(bodyHash("a\nc\n"));
    expect(bodyHash("")).toMatch(/^[0-9a-f]{64}$/);
  });
});
