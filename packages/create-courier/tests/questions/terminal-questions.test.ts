import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import { CancelledError } from "../../src/cancelled-error";
import { terminalQuestions } from "../../src/questions/terminal-questions";

/* A terminal as readline meets one: keys come in on the input, and the output is a TTY it draws on. */
function terminal() {
  const input = new PassThrough();
  const output = Object.assign(new PassThrough(), { isTTY: true, columns: 120 });
  let shown = "";
  output.on("data", (chunk: Buffer) => {
    shown += chunk.toString();
  });
  return { questions: terminalQuestions({ input, output }), input, shown: () => shown };
}

const FRAMEWORKS = [
  { value: "next", label: "Next.js" },
  { value: "nuxt", label: "Nuxt", hint: "Vue" },
  { value: "sveltekit", label: "SvelteKit" },
] as const;

describe("terminalQuestions().confirm", () => {
  it("takes y, yes, n and no in any case, and an empty reply as the answer it takes without one", async () => {
    const replies = ["y\r", "YES\r", "n\r", "No\r", "\r"];

    const answers: boolean[] = [];
    for (const reply of replies) {
      const { questions, input } = terminal();
      const answer = questions.confirm("Set Courier up?", false);
      input.write(reply);
      answers.push(await answer);
    }

    expect(answers).toEqual([true, true, false, false, false]);
  });

  it("shows which answer an empty reply gives, and asks again until the reply is a yes or a no", async () => {
    const { questions, input, shown } = terminal();

    const answer = questions.confirm("Set Courier up?", true);
    input.write("maybe\r");
    input.write("n\r");

    expect(await answer).toBe(false);
    expect(shown()).toContain("Set Courier up? [Y/n]");
    expect(shown()).toContain("Answer y or n:");
  });

  it("cancels with the status a shell gives an interrupted command when the person presses Ctrl+C", async () => {
    const { questions, input } = terminal();

    const answer = questions.confirm("Set Courier up?", true);
    input.write("\x03");

    const error = await answer.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CancelledError);
    expect(error).toMatchObject({ status: 130, message: "Cancelled: nothing was changed" });
  });

  it("cancels when the input closes, as Ctrl+D closes it", async () => {
    const { questions, input } = terminal();

    const answer = questions.confirm("Set Courier up?", true);
    input.end();

    const error = await answer.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CancelledError);
    expect(error).toMatchObject({ status: 1 });
  });
});

describe("terminalQuestions().select", () => {
  it("lists the answers by number with their hints, and takes the number picked", async () => {
    const { questions, input, shown } = terminal();

    const picked = questions.select("Create it with which framework?", FRAMEWORKS, "next");
    input.write("3\r");

    expect(await picked).toBe("sveltekit");
    expect(shown()).toContain("   2  Nuxt  Vue");
    expect(shown()).toContain("   3  SvelteKit");
  });

  it("takes the initial answer for an empty reply, and names its number", async () => {
    const { questions, input, shown } = terminal();

    const picked = questions.select("Create it with which framework?", FRAMEWORKS, "nuxt");
    input.write("\r");

    expect(await picked).toBe("nuxt");
    expect(shown()).toContain("Pick a number [2]:");
  });

  it("asks again for a number out of range, or a reply that is not a number", async () => {
    const { questions, input, shown } = terminal();

    const picked = questions.select("Create it with which framework?", FRAMEWORKS, "next");
    input.write("4\r");
    input.write("2x\r");
    input.write("2\r");

    expect(await picked).toBe("nuxt");
    expect(shown().split("Pick a number from 1 to 3:")).toHaveLength(3);
  });

  it("cancels when the person presses Ctrl+C", async () => {
    const { questions, input } = terminal();

    const picked = questions.select("Create it with which framework?", FRAMEWORKS, "next");
    input.write("\x03");

    await expect(picked).rejects.toBeInstanceOf(CancelledError);
  });
});

describe("terminalQuestions().text", () => {
  it("asks again with what the check says, until it says nothing is wrong, and takes the line trimmed", async () => {
    const { questions, input, shown } = terminal();

    const answer = questions.text("Where is the specification?", (line) =>
      line.endsWith(".json") ? undefined : "Name a .json file",
    );
    input.write("spec.yaml\r");
    input.write("  ./openapi.json  \r");

    expect(await answer).toBe("./openapi.json");
    expect(shown()).toContain("Name a .json file. Where is the specification?");
  });

  it("cancels when the person presses Ctrl+C", async () => {
    const { questions, input } = terminal();

    const answer = questions.text("Where is the specification?", () => undefined);
    input.write("\x03");

    await expect(answer).rejects.toBeInstanceOf(CancelledError);
  });
});
