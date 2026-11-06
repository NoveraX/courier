import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import { CancelledError } from "../../src/cancelled-error";
import { terminalQuestions } from "../../src/questions/terminal-questions";

const ENTER = "\r";
const DOWN = "\x1b[B";
const CTRL_C = "\x03";
const BACKSPACE = "\x7f";

/* A terminal as clack meets one: keys come in on the input, and it draws on the output. */
function terminal() {
  const input = new PassThrough();
  const output = new PassThrough();
  let shown = "";
  output.on("data", (chunk: Buffer) => {
    shown += chunk.toString();
  });
  /* Press the keys once the question is drawn, each after the one before is read. */
  const press = async (...keys: string[]) => {
    while (!shown.includes("◆") && !shown.includes("◇"))
      await new Promise((done) => setTimeout(done, 5));
    for (const key of keys) {
      input.write(key);
      await new Promise((done) => setTimeout(done, 15));
    }
  };
  return { questions: terminalQuestions({ input, output }), input, press, shown: () => shown };
}

const FRAMEWORKS = [
  { value: "next", label: "Next.js" },
  { value: "nuxt", label: "Nuxt", hint: "Vue" },
  { value: "sveltekit", label: "SvelteKit" },
] as const;

describe("terminalQuestions().confirm", () => {
  it("takes y and n, and Enter as the answer it takes without one, drawing the question", async () => {
    const answers: boolean[] = [];
    let drawn = "";
    for (const [key, initial] of [
      ["y", false],
      ["n", true],
      [ENTER, true],
      [ENTER, false],
    ] as const) {
      const { questions, press, shown } = terminal();
      const answer = questions.confirm("Set Courier up?", initial);
      await press(key);
      answers.push(await answer);
      drawn = shown();
    }

    expect(answers).toEqual([true, false, true, false]);
    expect(drawn).toContain("Set Courier up?");
  });

  it("cancels with the status a shell gives an interrupted command when the person presses Ctrl+C", async () => {
    const { questions, press } = terminal();

    const answer = questions.confirm("Set Courier up?", true).catch((caught: unknown) => caught);
    await press(CTRL_C);

    const error = await answer;
    expect(error).toBeInstanceOf(CancelledError);
    expect(error).toMatchObject({ status: 130, message: "Cancelled: nothing was changed" });
  });

  it("cancels when the input closes, as Ctrl+D closes it", async () => {
    const { questions, input, press } = terminal();

    const answer = questions.confirm("Set Courier up?", true).catch((caught: unknown) => caught);
    await press();
    input.end();

    const error = await answer;
    expect(error).toBeInstanceOf(CancelledError);
    expect(error).toMatchObject({ status: 1 });
  });
});

describe("terminalQuestions().select", () => {
  it("lists the answers, and takes the one the arrows reach", async () => {
    const { questions, press, shown } = terminal();

    const picked = questions.select("Create it with which framework?", FRAMEWORKS, "next");
    await press(DOWN, DOWN, ENTER);

    expect(await picked).toBe("sveltekit");
    expect(shown()).toContain("Nuxt");
    expect(shown()).toContain("SvelteKit");
  });

  it("takes the initial answer on Enter", async () => {
    const { questions, press } = terminal();

    const picked = questions.select("Create it with which framework?", FRAMEWORKS, "nuxt");
    await press(ENTER);

    expect(await picked).toBe("nuxt");
  });

  it("cancels when the person presses Ctrl+C", async () => {
    const { questions, press } = terminal();

    const picked = questions
      .select("Create it with which framework?", FRAMEWORKS, "next")
      .catch((caught: unknown) => caught);
    await press(CTRL_C);

    expect(await picked).toMatchObject({ status: 130 });
  });
});

describe("terminalQuestions().text", () => {
  it("says what the check says until it says nothing is wrong, and takes the line trimmed", async () => {
    const { questions, press, shown } = terminal();

    const answer = questions.text("Where is the specification?", (line) =>
      line.endsWith(".json") ? undefined : "Name a .json file",
    );
    await press("spec.yaml", ENTER, BACKSPACE.repeat(9), "  ./openapi.json  ", ENTER);

    expect(await answer).toBe("./openapi.json");
    expect(shown()).toContain("Name a .json file");
  });

  it("cancels when the person presses Ctrl+C", async () => {
    const { questions, press } = terminal();

    const answer = questions
      .text("Where is the specification?", () => undefined)
      .catch((caught: unknown) => caught);
    await press(CTRL_C);

    expect(await answer).toBeInstanceOf(CancelledError);
  });
});
