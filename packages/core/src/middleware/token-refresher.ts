/** What a token source gives: the token, or `null`, `undefined` or `""` for none. */
export type GivenToken = string | null | undefined;

/** One refresh at a time, shared by every call its 401s came from. */
export interface TokenRefresher {
  /** How many refreshes have ended with a token: read as a call sends, to know later whether one came since. */
  readonly generation: number;
  /**
   * The token a call refused with 401 sends again: the one a refresh that
   * ended since the call was sent gave, the one a refresh still running
   * gives, or a new refresh's.
   *
   * @param sentAt - The generation the call was sent at
   * @returns The token, or `undefined` when no refresh could give one
   */
  renew(sentAt: number): Promise<string | undefined>;
}

/**
 * Renew a token for the calls the upstream refused with it, once for all
 * of them, however their refusals fall. A call joins a refresh that is
 * running; one sent before a refresh that has since ended takes that
 * refresh's token, without a new one — so a hundred calls sent with an
 * expired token, refused one by one, cost one refresh. A call sent after
 * the last refresh ended, whose token was refused all the same, starts a
 * new one. A refresh that fails, or gives no token, leaves nothing behind:
 * the next 401 tries again.
 *
 * @param refreshToken - Gives a new token
 * @returns The refresher
 * @example
 * ```ts
 * const refresher = tokenRefresher(() => session.renew());
 * const sentAt = refresher.generation;
 * // … the call is refused with 401
 * const token = await refresher.renew(sentAt);
 * ```
 */
export function tokenRefresher(
  refreshToken: () => GivenToken | Promise<GivenToken>,
): TokenRefresher {
  let generation = 0;
  let latest: string | undefined;
  let running: Promise<string | undefined> | undefined;

  const refresh = async (): Promise<string | undefined> => {
    const token = tokenOf(await refreshToken());
    if (token !== undefined) {
      latest = token;
      generation += 1;
    }
    return token;
  };

  return {
    get generation() {
      return generation;
    },
    renew(sentAt) {
      if (running) return running;
      if (sentAt < generation) return Promise.resolve(latest);
      running = refresh().finally(() => {
        running = undefined;
      });
      return running;
    },
  };
}

/**
 * A token as a header carries it: `undefined` for none.
 *
 * @param given - What a token source gave
 * @returns The token, or `undefined` for `null`, `undefined` and `""`
 */
export function tokenOf(given: GivenToken): string | undefined {
  return given === null || given === undefined || given === "" ? undefined : given;
}
