import type { Readable, Writable } from "node:stream";

import { CancelledError } from "../cancelled-error";
import type { Questions } from "./questions";

/** Where a question is read from, and where it is drawn. */
export interface QuestionStreams {
  readonly input: Readable;
  readonly output: Writable;
}

/* What each of clack's questions is given beside its own options. */
interface Asking {
  readonly input: Readable;
  readonly output: Writable;
  readonly signal: AbortSignal;
}

/* clack, loaded the first time a question is asked: a run that asks nothing never loads it. */
const clack = () => import("@clack/prompts");

/*
 * Ask one question, its input's end cancelling it as Ctrl+D ends it,
 * which clack would otherwise wait past.
 */
async function asked<TAnswer>(
  { input, output }: QuestionStreams,
  ask: (asking: Asking) => Promise<TAnswer>,
): Promise<TAnswer> {
  const ended = new AbortController();
  const onEnd = () => ended.abort();
  input.once("end", onEnd);
  try {
    return await ask({ input, output, signal: ended.signal });
  } finally {
    input.off("end", onEnd);
  }
}

/* What a cancelled question throws: Ctrl+C or Escape stops the run as a shell stops a command it interrupts; the input's end, as one whose input closed. */
function cancelled({ signal }: Asking): CancelledError {
  return new CancelledError(!signal.aborted);
}

/**
 * The questions a run asks at the terminal, drawn by clack: a yes or a
 * no, one of a list picked with the arrows, a line of text checked as it
 * is given. They are drawn on standard error, so that what the command
 * prints on standard output stays its own.
 *
 * @param streams - Where to ask them (default: the terminal, drawn on standard error)
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
      asked(streams, async (asking) => {
        const { confirm, isCancel } = await clack();
        const answer = await confirm({ ...asking, message, initialValue: initial });
        if (isCancel(answer)) throw cancelled(asking);
        return answer;
      }),
    select: (message, choices, initial) =>
      asked(streams, async (asking) => {
        const { select, isCancel } = await clack();
        /* clack types an option by its value: as a plain string, it takes it whatever the choice's type. */
        const options = choices.map(({ value, label, hint }) => ({
          value: String(value),
          label,
          ...(hint === undefined ? {} : { hint }),
        }));
        const answer = await select({ ...asking, message, options, initialValue: initial });
        if (isCancel(answer)) throw cancelled(asking);
        const choice = choices.find((each) => each.value === answer);
        if (choice === undefined)
          throw new Error(`"${message}" was answered with none of its choices`);
        return choice.value;
      }),
    text: (message, check) =>
      asked(streams, async (asking) => {
        const { text, isCancel } = await clack();
        const validate = (line: string | undefined) => check((line ?? "").trim());
        const answer = await text({ ...asking, message, validate });
        if (isCancel(answer)) throw cancelled(asking);
        return answer.trim();
      }),
  };
}
