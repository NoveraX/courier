/**
 * @vitest-environment jsdom
 *
 * The Playground's JSON editor draws its text, coloured, under a textarea
 * whose own text is transparent: what the textarea holds is what shows,
 * character for character, while a string is still being typed too.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { CodeEditor } from "@/screens/playground/code-editor";

function Editor({ initial }: { initial: string }): React.ReactNode {
  const [text, setText] = useState(initial);
  return <CodeEditor value={text} onChange={setText} label="Variables" />;
}

const area = () => screen.getByRole("textbox", { name: "Variables" });

/* The coloured layer drawn under the textarea, one element a line. */
const drawnLines = () =>
  [...(area().previousElementSibling?.children ?? [])].map((line) => line.textContent);

afterEach(cleanup);

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
