/**
 * @vitest-environment jsdom
 *
 * A form body sent from the Playground: what travels to the runtime, what the
 * history shows, and the upload's progress on the entry.
 */
import { describe, expect, it } from "vitest";

import { useStudioStore } from "../src/store";
import type { PlaygroundHistoryEntry } from "../src/store/types-ui";
import { describeForm, emptyField, wireForm } from "../src/views/playground/form-body";

function fields() {
  const note = { ...emptyField(), name: "note", text: "hi" };
  const photo = {
    ...emptyField("file"),
    name: "photo",
    file: new File([new Uint8Array(2048)], "photo.bin"),
  };
  const unnamed = { ...emptyField(), text: "dropped" };
  const unchosen = { ...emptyField("file"), name: "later" };
  return [note, photo, unnamed, unchosen];
}

describe("a Playground form body", () => {
  it("sends each named field in order, a file with its bytes", async () => {
    const form = await wireForm(fields());

    expect(form.map((field) => field.name)).toEqual(["note", "photo"]);
    expect(form[0]).toEqual({ name: "note", text: "hi" });
    expect(form[1]).toMatchObject({ name: "photo", file: { name: "photo.bin" } });
    const photo = form[1];
    expect(photo && "file" in photo ? photo.file.data.byteLength : 0).toBe(2048);
  });

  it("is described in the history by its text and its files' names and sizes", () => {
    expect(JSON.parse(describeForm(fields()))).toEqual({ note: "hi", photo: "photo.bin (2.0 KB)" });
  });

  it("shows its upload's progress on the entry until the answer comes", () => {
    const entry: PlaygroundHistoryEntry = {
      id: "e1",
      rid: "r1",
      source: "api",
      group: "files",
      method: "upload",
      variables: "{}",
      headers: "{}",
      mode: "direct",
      timestamp: 1,
      status: "pending",
    };
    const store = useStudioStore.getState();
    store.addPlaygroundEntry(entry);
    store.appendPlaygroundChunk("r1", {
      kind: "upload-progress",
      loaded: 512,
      total: 2048,
      percentage: 25,
    });

    const shown = useStudioStore.getState().playgroundActiveResponse;
    expect(shown?.upload).toEqual({ loaded: 512, total: 2048, percentage: 25 });
    expect(shown?.chunks ?? []).toEqual([]);
  });
});
