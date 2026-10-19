/**
 * @vitest-environment jsdom
 *
 * The Playground's JSON editor draws its text, coloured, under a textarea
 * whose own text is transparent: what the textarea holds is what shows,
 * character for character, while a string is still being typed too. Its
 * own edits — Tab, Shift+Tab, ⌘/ — are typed through the browser, so ⌘Z
 * undoes them and what came before them.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeEditor } from "@/screens/playground/code-editor";

function Editor({ initial }: { initial: string }): React.ReactNode {
  const [text, setText] = useState(initial);
  return <CodeEditor value={text} onChange={setText} label="Variables" />;
}

const area = () => screen.getByRole("textbox", { name: "Variables" }) as HTMLTextAreaElement;

/* The coloured layer drawn under the textarea, one element a line. */
const drawnLines = () =>
  [...(area().previousElementSibling?.children ?? [])].map((line) => line.textContent);

/* The browser's editing command, as a browser runs it on the focused field. */
function stubBrowserTyping() {
  const typed = vi.fn((command: string, _showUi?: boolean, text = "") => {
    const field = document.activeElement as HTMLTextAreaElement;
    const replaced = { from: field.selectionStart, to: field.selectionEnd };
    field.setRangeText(command === "delete" ? "" : text, replaced.from, replaced.to, "end");
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  });
  Object.defineProperty(document, "execCommand", { value: typed, configurable: true });
  return typed;
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "execCommand");
});

describe("CodeEditor", () => {
  it("draws a quote the moment it is typed, before the string closes", () => {
    render(<Editor initial={'{\n  "city": "spb",\n  \n}'} />);

    fireEvent.change(area(), { target: { value: '{\n  "city": "spb",\n  "\n}' } });

    expect(drawnLines()).toEqual(["{", '  "city": "spb",', '  "', "}"]);
  });

  it("draws each line as the textarea holds it while a key and its value are typed", () => {
    render(<Editor initial="{}" />);
    const typed = ['{"', '{"ci', '{"city"', '{"city": "', '{"city": "spb', '{"city": "spb"}'];

    for (const text of typed) {
      fireEvent.change(area(), { target: { value: text } });

      expect(drawnLines()).toEqual([text]);
    }
  });
});

describe("the editor's own edits", () => {
  it("types the indent Tab adds through the browser, where ⌘Z can undo it", () => {
    const typed = stubBrowserTyping();
    render(<Editor initial={'{\n"a": 1\n}'} />);
    area().focus();
    area().setSelectionRange(2, 2);

    fireEvent.keyDown(area(), { key: "Tab" });

    expect(typed).toHaveBeenCalledWith("insertText", false, "  ");
    expect(area().value).toBe('{\n  "a": 1\n}');
    expect(drawnLines()).toEqual(["{", '  "a": 1', "}"]);
  });

  it("deletes the indent Shift+Tab takes away through the browser", () => {
    const typed = stubBrowserTyping();
    render(<Editor initial={'{\n  "a": 1\n}'} />);
    area().focus();
    area().setSelectionRange(6, 6);

    fireEvent.keyDown(area(), { key: "Tab", shiftKey: true });

    expect(typed).toHaveBeenCalledWith("delete");
    expect(area().value).toBe('{\n"a": 1\n}');
  });

  it("types only the comment mark ⌘/ adds, not the whole text", () => {
    const typed = stubBrowserTyping();
    render(<Editor initial={'{\n  "a": 1\n}'} />);
    area().focus();
    area().setSelectionRange(5, 5);

    fireEvent.keyDown(area(), { key: "/", metaKey: true });

    expect(typed).toHaveBeenCalledWith("insertText", false, "// ");
    expect(area().value).toBe('{\n  // "a": 1\n}');
  });

  it("leaves the text alone when Shift+Tab finds no indent to take", () => {
    const typed = stubBrowserTyping();
    render(<Editor initial={'{\n"a": 1\n}'} />);
    area().focus();
    area().setSelectionRange(4, 4);

    fireEvent.keyDown(area(), { key: "Tab", shiftKey: true });

    expect(typed).not.toHaveBeenCalled();
    expect(area().value).toBe('{\n"a": 1\n}');
  });

  it("still indents where the browser has no editing command", () => {
    render(<Editor initial={'{\n"a": 1\n}'} />);
    area().focus();
    area().setSelectionRange(2, 2);

    fireEvent.keyDown(area(), { key: "Tab" });

    expect(area().value).toBe('{\n  "a": 1\n}');
  });
});
