import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

import { CancelledError } from "../cancelled-error";
import type { Choice, Questions } from "./questions";

/** Where a question is read from, and where it is asked. */
export interface QuestionStreams {
  readonly input: Readable;
  readonly output: Writable;
}

/* A reply, read: the answer it gives, or what to ask again with. */
type Reading<TAnswer> = { readonly answer: TAnswer } | { readonly again: string };

/* Ask until a reply reads as an answer; Ctrl+C, or the input closing, cancels the command. */
function ask<TAnswer>(
  question: string,
  read: (reply: string) => Reading<TAnswer>,
  { input, output }: QuestionStreams,
): Promise<TAnswer> {
  return new Promise((resolve, reject) => {
    const reader = createInterface({ input, output });
    let interrupted = false;
    let taken: { value: TAnswer } | undefined;
    reader.on("SIGINT", () => {
      interrupted = true;
      reader.close();
    });
    reader.on("close", () =>
      taken ? resolve(taken.value) : reject(new CancelledError(interrupted)),
    );
    const take = (reply: string) => {
      const reading = read(reply.trim());
      if ("again" in reading) {
        reader.question(reading.again, take);
        return;
      }
      taken = { value: reading.answer };
      reader.close();
    };
    reader.question(question, take);
  });
}

function yesOrNo(reply: string, initial: boolean): Reading<boolean> {
  if (reply === "") return { answer: initial };
  if (/^y(es)?$/i.test(reply)) return { answer: true };
  if (/^no?$/i.test(reply)) return { answer: false };
  return { again: "Answer y or n: " };
}

function picked<TValue extends string>(
  reply: string,
  choices: readonly Choice<TValue>[],
  initial: TValue,
): Reading<TValue> {
  if (reply === "") return { answer: initial };
  const at = /^\d+$/.test(reply) ? Number(reply) - 1 : -1;
  const choice = choices[at];
  return choice === undefined
    ? { again: `Pick a number from 1 to ${choices.length}: ` }
    : { answer: choice.value };
}

/**
 * The questions a run asks at the terminal, by line: a yes or a no as
 * `y` or `n`, one of a list by its number, a line of text. They are
 * asked on standard error, so that what the command prints on standard
 * output stays its own.
 *
 * @param streams - Where to ask them (default: the terminal, on standard error)
 * @returns The questions
 * @example
 * ```ts
 * if (await terminalQuestions().confirm("Set Courier up?", true)) apply();
 * ```
 */
export function terminalQuestions(
  streams: QuestionStreams = { input: process.stdin, output: process.stderr },
): Questions {
  return {
    confirm: (message, initial) =>
      ask(
        `${message} ${initial ? "[Y/n]" : "[y/N]"} `,
        (reply) => yesOrNo(reply, initial),
        streams,
      ),
    select(message, choices, initial) {
      const at = Math.max(
        0,
        choices.findIndex((choice) => choice.value === initial),
      );
      const list = choices.map(
        (choice, index) =>
          `  ${String(index + 1).padStart(2)}  ${choice.label}${choice.hint ? `  ${choice.hint}` : ""}`,
      );
      return ask(
        `${message}\n${list.join("\n")}\nPick a number [${at + 1}]: `,
        (reply) => picked(reply, choices, choices[at]?.value ?? initial),
        streams,
      );
    },
    text: (message, check) =>
      ask(
        `${message} `,
        (reply) => {
          const problem = check(reply);
          return problem === undefined ? { answer: reply } : { again: `${problem}. ${message} ` };
        },
        streams,
      ),
  };
}
