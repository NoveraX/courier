/**
 * A form reaches a mock's handler as its fields whether it was posted to the
 * mock server or passed to a mock client in-process, so one handler — or one
 * scenario — answers both the same way.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { createMockClient } from "../src/create-mock-client";
import { formFields, handlerVariables } from "../src/form-fields";

const { endpoint } = courier();
const api = defineApi({
  baseURL: "http://mock.test",
  groups: {
    files: defineGroup({
      prefix: "files",
      endpoints: { upload: endpoint.post("").variables<FormData>().response<string[]>() },
    }),
  },
});

function sampleForm(): FormData {
  const form = new FormData();
  form.append("title", "Q3");
  form.append("files", new File(["a"], "a.txt", { type: "text/plain" }));
  form.append("files", new File(["bb"], "b.txt", { type: "text/plain" }));
  return form;
}

describe("a form passed to a mock client", () => {
  it("reaches the handler as its fields, each file the File itself, in the order sent", async () => {
    const { client, mock } = createMockClient<typeof api>();
    mock("files", "upload").returns(({ variables }) => {
      const files = Array.isArray(variables.files) ? variables.files : [];
      return [String(variables.title), ...files.map((f) => (f instanceof File ? f.name : ""))];
    });

    const answer = await client.files.upload(sampleForm());

    expect(answer).toEqual(["Q3", "a.txt", "b.txt"]);
  });

  it("is recorded in the history as the fields the handler was given", async () => {
    const { client, mock, history } = createMockClient<typeof api>();
    mock("files", "upload").resolves([]);

    /* The same form: a File's `lastModified` is the moment it was made. */
    const form = sampleForm();
    await client.files.upload(form);

    expect(history[0]?.variables).toEqual(formFields(form));
  });
});

describe("handlerVariables", () => {
  it("leaves any value that is not a form as it is", () => {
    const variables = { id: 1 };

    expect(handlerVariables(variables)).toBe(variables);
  });

  it("keeps a field called __proto__ a field", () => {
    const form = new FormData();
    form.append("__proto__", "x");

    expect(Object.hasOwn(formFields(form), "__proto__")).toBe(true);
  });
});
