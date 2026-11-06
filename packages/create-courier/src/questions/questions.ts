/** One answer of a question to pick from: what it gives, how it reads, and a word beside it. */
export interface Choice<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly hint?: string | undefined;
}

/**
 * What a run asks the person at the terminal, each question with the
 * answer it takes without one. A run that has no `Questions` asks
 * nothing, and takes those answers itself.
 *
 * Each question rejects with a `CancelledError` when the person presses
 * Ctrl+C, or its input closes.
 */
export interface Questions {
  /** A yes or a no. */
  confirm(message: string, initial: boolean): Promise<boolean>;
  /** One of a list, the initial one where the person picks none. */
  select<TValue extends string>(
    message: string,
    choices: readonly Choice<TValue>[],
    initial: TValue,
  ): Promise<TValue>;
  /** A line, asked again with what `check` says until it says nothing is wrong. */
  text(message: string, check: (answer: string) => string | undefined): Promise<string>;
}
