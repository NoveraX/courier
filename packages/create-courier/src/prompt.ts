import { createInterface } from "node:readline/promises";

/**
 * Ask the person at the terminal a yes-or-no question on standard error,
 * so what the command prints on standard output stays its own.
 *
 * @param question - The question
 * @param preselected - The answer an empty reply gives
 * @returns The answer
 * @example
 * ```ts
 * if (await askYesNo("Set Courier up?", true)) apply();
 * ```
 */
export async function askYesNo(question: string, preselected: boolean): Promise<boolean> {
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (
      await prompt.question(`${question} ${preselected ? "[Y/n]" : "[y/N]"} `)
    ).trim();
    return answer === "" ? preselected : /^y(es)?$/i.test(answer);
  } finally {
    prompt.close();
  }
}

/**
 * Ask the person to pick one of a list, by its number.
 *
 * @param question - The question
 * @param choices - What to pick from, as shown
 * @returns The index picked; the first for an empty reply
 * @example
 * ```ts
 * const at = await askChoice("Which framework?", ["Next.js", "Nuxt"]);
 * ```
 */
export async function askChoice(question: string, choices: readonly string[]): Promise<number> {
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const list = choices
      .map((choice, at) => `  ${String(at + 1).padStart(2)}  ${choice}`)
      .join("\n");
    while (true) {
      const answer = (await prompt.question(`${question}\n${list}\nPick a number [1]: `)).trim();
      const picked = answer === "" ? 1 : Number.parseInt(answer, 10);
      if (picked >= 1 && picked <= choices.length) return picked - 1;
      process.stderr.write(`Pick a number from 1 to ${choices.length}.\n`);
    }
  } finally {
    prompt.close();
  }
}
