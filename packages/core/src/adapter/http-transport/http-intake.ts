/** The client's frames as its requests bring them. */
export interface Intake {
  /**
   * Take the frames of one request, the first numbered `seq` by the client:
   * each one not taken before, in order. `false`, and none taken, when
   * frames before them have not arrived.
   */
  receive(seq: number, frames: readonly string[]): boolean;
}

/**
 * The client's frames, numbered by the client from 1, each taken once and
 * in its order: a request the client sent again, because its answer was
 * lost, brings nothing twice, and one that overtook an earlier request is
 * refused until that one has come.
 *
 * @param take - What a frame taken goes to
 * @returns The intake, expecting frame 1
 * @example
 * ```ts
 * const intake = createIntake((frame) => listeners.message(frame));
 * intake.receive(1, [auth, subscribe]); // true
 * intake.receive(2, [subscribe, send]); // true: only the send is taken
 * ```
 */
export function createIntake(take: (frame: string) => void): Intake {
  let expected = 1;
  return {
    receive(seq, frames) {
      if (seq > expected) return frames.length === 0;
      for (let at = expected - seq; at < frames.length; at++) {
        expected++;
        take(frames[at] as string);
      }
      return true;
    },
  };
}
