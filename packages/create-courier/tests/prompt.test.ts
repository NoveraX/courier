import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import { CancelledError } from "../src/cancelled-error";
import { askChoice, askYesNo } from "../src/prompt";

/* A terminal as readline meets one: keys come in on the input, and the output is a TTY it draws on. */
function terminal() {
  const input = new PassThrough();
  const output = Object.assign(new PassThrough(), { isTTY: true, columns: 120 });
  let shown = "";
  output.on("data", (chunk: Buffer) => {
    shown += chunk.toString();
  });
  return { streams: { input, output }, input, shown: () => shown };
}

describe("askYesNo", () => {
  it("takes y, yes, n and no in any case, and an empty reply as the answer preselected", async () => {
    const replies = ["y\r", "YES\r", "n\r", "No\r", "\r"];

    const answers: boolean[] = [];
    for (const reply of replies) {
      const { streams, input } = terminal();
      const answer = askYesNo("Set Courier up?", false, streams);
      input.write(reply);
      answers.push(await answer);
    }

    expect(answers).toEqual([true, true, false, false, false]);
  });

  it("shows which answer an empty reply gives", async () => {
    const { streams, input, shown } = terminal();

    const answer = askYesNo("Set Courier up?", true, streams);
    input.write("\r");

    expect(await answer).toBe(true);
    expect(shown()).toContain("Set Courier up? [Y/n]");
  });

  it("asks again until the reply is a yes or a no", async () => {
    const { streams, input, shown } = terminal();

    const answer = askYesNo("Set Courier up?", true, streams);
    input.write("maybe\r");
    input.write("n\r");

    expect(await answer).toBe(false);
    expect(shown()).toContain("Answer y or n:");
  });

  it("cancels with the status a shell gives an interrupted command when the person presses Ctrl+C", async () => {
    const { streams, input } = terminal();

    const answer = askYesNo("Set Courier up?", true, streams);
    input.write("\x03");

    const error = await answer.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CancelledError);
    expect(error).toMatchObject({ status: 130, message: "Cancelled: nothing was changed" });
  });

  it("cancels when the input closes, as Ctrl+D closes it", async () => {
    const { streams, input } = terminal();

    const answer = askYesNo("Set Courier up?", true, streams);
    input.end();

    const error = await answer.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CancelledError);
    expect(error).toMatchObject({ status: 1 });
  });
});

describe("askChoice", () => {
  const FRAMEWORKS = ["Next.js", "Nuxt", "SvelteKit"];

  it("lists the choices by number, and takes the number picked", async () => {
    const { streams, input, shown } = terminal();

    const picked = askChoice("Create it with which framework?", FRAMEWORKS, streams);
    input.write("3\r");

    expect(await picked).toBe(2);
    expect(shown()).toContain("   3  SvelteKit");
  });

  it("takes the first for an empty reply", async () => {
    const { streams, input } = terminal();

    const picked = askChoice("Create it with which framework?", FRAMEWORKS, streams);
    input.write("\r");

    expect(await picked).toBe(0);
  });

  it("asks again for a number out of range, or a reply that is not a number", async () => {
    const { streams, input, shown } = terminal();

    const picked = askChoice("Create it with which framework?", FRAMEWORKS, streams);
    input.write("4\r");
    input.write("2x\r");
    input.write("2\r");

    expect(await picked).toBe(1);
    expect(shown().split("Pick a number from 1 to 3:")).toHaveLength(3);
  });

  it("cancels when the person presses Ctrl+C", async () => {
    const { streams, input } = terminal();

    const picked = askChoice("Create it with which framework?", FRAMEWORKS, streams);
    input.write("\x03");

    await expect(picked).rejects.toBeInstanceOf(CancelledError);
  });
});
