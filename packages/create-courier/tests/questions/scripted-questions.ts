import { CancelledError } from "../../src/cancelled-error";
import type { Questions } from "../../src/questions/questions";

/** The answer that stands for Ctrl+C. */
export const CTRL_C = Symbol("Ctrl+C");

/** A question as the run asked it. */
export interface Asked {
  readonly kind: "confirm" | "select" | "text";
  readonly message: string;
  /** The answer it takes without one: a confirm's and a select's. */
  readonly initial?: boolean | string | undefined;
  /** A select's answers, by value. */
  readonly choices?: readonly string[] | undefined;
  /** What a text's check said of the answers it refused. */
  readonly refused?: readonly string[] | undefined;
}

/**
 * Questions a test answers, in turn, from the answers it gives: a
 * question asked with none left, or answered with what it cannot take,
 * fails the test. `CTRL_C` cancels the question; a text asks again while
 * its check refuses the answer.
 *
 * @param answers - The answers, in the order the run is to ask
 * @returns The questions, and those asked
 */
export function scripted(
  answers: ReadonlyArray<boolean | string | typeof CTRL_C>,
): Questions & { readonly asked: Asked[] } {
  const left = [...answers];
  const asked: Asked[] = [];
  const next = (question: Asked) => {
    asked.push(question);
    if (left.length === 0) throw new Error(`asked "${question.message}" with no answer left`);
    const answer = left.shift();
    if (answer === CTRL_C) throw new CancelledError(true);
    return answer;
  };
  return {
    asked,
    async confirm(message, initial) {
      const answer = next({ kind: "confirm", message, initial });
      if (typeof answer !== "boolean") throw new Error(`"${message}" takes a yes or a no`);
      return answer;
    },
    async select(message, choices, initial) {
      const values = choices.map((choice) => choice.value);
      const answer = next({ kind: "select", message, initial, choices: values });
      const choice = choices.find((each) => each.value === answer);
      if (choice === undefined) throw new Error(`"${message}" has no answer ${String(answer)}`);
      return choice.value;
    },
    async text(message, check) {
      const refused: string[] = [];
      for (;;) {
        const answer = next({ kind: "text", message, refused });
        if (typeof answer !== "string") throw new Error(`"${message}" takes a line`);
        const problem = check(answer);
        if (problem === undefined) return answer;
        refused.push(problem);
        asked.pop();
      }
    },
  };
}
