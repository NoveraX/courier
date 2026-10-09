import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

import { CancelledError } from "./cancelled-error";

/** Where a question is read from, and where it is asked. */
export interface PromptStreams {
  readonly input: Readable;
  readonly output: Writable;
}

/* Standard error, so that what the command prints on standard output stays its own. */
function terminalStreams(): PromptStreams {
  return { input: process.stdin, output: process.stderr };
}

/* Ask until a reply reads as an answer; Ctrl+C, or the input closing, cancels the command. */
function ask<TAnswer>(
  question: string,
  read: (reply: string) => TAnswer | undefined,
  again: string,
  { input, output }: PromptStreams,
): Promise<TAnswer> {
  return new Promise((resolve, reject) => {
    const prompt = createInterface({ input, output });
    let interrupted = false;
    let answer: { value: TAnswer } | undefined;
    prompt.on("SIGINT", () => {
      interrupted = true;
      prompt.close();
    });
    prompt.on("close", () =>
      answer ? resolve(answer.value) : reject(new CancelledError(interrupted)),
    );
    const take = (reply: string) => {
      const value = read(reply.trim());
      if (value === undefined) {
        prompt.question(again, take);
        return;
      }
      answer = { value };
      prompt.close();
    };
    prompt.question(question, take);
  });
}

function yesOrNo(reply: string, preselected: boolean): boolean | undefined {
  if (reply === "") return preselected;
  if (/^y(es)?$/i.test(reply)) return true;
  if (/^no?$/i.test(reply)) return false;
  return undefined;
}

function pickedOf(reply: string, count: number): number | undefined {
  const picked = reply === "" ? 1 : Number(/^\d+$/.exec(reply)?.[0] ?? 0);
  return picked >= 1 && picked <= count ? picked - 1 : undefined;
}

/**
 * Ask the person at the terminal a yes-or-no question, again until the reply
 * is one.
 *
 * @param question - The question
 * @param preselected - The answer an empty reply gives
 * @param streams - Where to ask it (default: the terminal, on standard error)
 * @returns The answer
 * @throws {CancelledError} When the person presses Ctrl+C, or the input closes
 * @example
 * ```ts
 * if (await askYesNo("Set Courier up?", true)) apply();
 * ```
 */
export function askYesNo(
  question: string,
  preselected: boolean,
  streams: PromptStreams = terminalStreams(),
): Promise<boolean> {
  return ask(
    `${question} ${preselected ? "[Y/n]" : "[y/N]"} `,
    (reply) => yesOrNo(reply, preselected),
    "Answer y or n: ",
    streams,
  );
}

/**
 * Ask the person to pick one of a list, by its number, again until the
 * reply is one of them.
 *
 * @param question - The question
 * @param choices - What to pick from, as shown
 * @param streams - Where to ask it (default: the terminal, on standard error)
 * @returns The index picked; the first for an empty reply
 * @throws {CancelledError} When the person presses Ctrl+C, or the input closes
 * @example
 * ```ts
 * const at = await askChoice("Which framework?", ["Next.js", "Nuxt"]);
 * ```
 */
export function askChoice(
  question: string,
  choices: readonly string[],
  streams: PromptStreams = terminalStreams(),
): Promise<number> {
  const list = choices.map((choice, at) => `  ${String(at + 1).padStart(2)}  ${choice}`).join("\n");
  return ask(
    `${question}\n${list}\nPick a number [1]: `,
    (reply) => pickedOf(reply, choices.length),
    `Pick a number from 1 to ${choices.length}: `,
    streams,
  );
}
