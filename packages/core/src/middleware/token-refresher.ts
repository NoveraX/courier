/** What a token source gives: the token, or `null`, `undefined` or `""` for none. */
export type GivenToken = string | null | undefined;

/* The refreshes a refresher remembers, the oldest forgotten first, and the ones it lets calls
   join at once: enough for the users of one server, and no more held however many come. */
const REMEMBERED = 100;
const SHARED = 1000;

/** One refresh for each token refused, shared by every call refused with that token. */
export interface TokenRefresher {
  /** How many refreshes have ended with a token: read as a call sends, to know later whether one came since. */
  readonly generation: number;
  /**
   * The token a call refused with 401 sends again: the one a refresh of
   * the token it was refused with gives — a refresh that ended since the
   * call was sent, one still running, or a new one.
   *
   * @param refused - The token the call was sent with, `undefined` for none
   * @param sentAt - The generation the call was sent at
   * @returns The token, or `undefined` when no refresh could give one
   */
  renew(refused: string | undefined, sentAt: number): Promise<string | undefined>;
}

/**
 * Renew a token for the calls the upstream refused with it, once for all
 * of them, however their refusals fall. A call joins the refresh of its own
 * token that is running; one sent before such a refresh ended takes that
 * refresh's token, without a new one — so a hundred calls sent with an
 * expired token, refused one by one, cost one refresh. A refresh is never
 * shared between tokens: on a server, where each request's user has a
 * token of its own, one user's call never takes another's. A call sent
 * after the refresh of its token ended, refused all the same, and a call
 * sent with no token start a refresh of their own. A refresh that fails,
 * or gives no token, leaves nothing behind: the next 401 tries again.
 *
 * @param refreshToken - Gives a new token
 * @returns The refresher
 * @example
 * ```ts
 * const refresher = tokenRefresher(() => session.renew());
 * const sentAt = refresher.generation;
 * // … the call, sent with `token`, is refused with 401
 * const renewed = await refresher.renew(token, sentAt);
 * ```
 */
export function tokenRefresher(
  refreshToken: () => GivenToken | Promise<GivenToken>,
): TokenRefresher {
  let generation = 0;
  /* Each token refused, with the token a refresh replaced it with and the generation it did. */
  const issued = new Map<string, { token: string; at: number }>();
  const running = new Map<string, Promise<string | undefined>>();

  const remember = (refused: string, token: string): void => {
    /* A token renewed in turn: a call refused with one it replaced takes the newest. */
    for (const entry of issued.values()) if (entry.token === refused) entry.token = token;
    issued.delete(refused);
    issued.set(refused, { token, at: generation });
    for (const oldest of issued.keys()) {
      if (issued.size <= REMEMBERED) break;
      issued.delete(oldest);
    }
  };

  const refresh = async (refused: string | undefined): Promise<string | undefined> => {
    const token = tokenOf(await refreshToken());
    if (token === undefined) return undefined;
    generation += 1;
    if (refused !== undefined) remember(refused, token);
    return token;
  };

  return {
    get generation() {
      return generation;
    },
    renew(refused, sentAt) {
      if (refused === undefined) return refresh(undefined);
      const joined = running.get(refused);
      if (joined) return joined;
      const renewed = issued.get(refused);
      if (renewed && sentAt < renewed.at) return Promise.resolve(renewed.token);
      const started = refresh(refused).finally(() => {
        if (running.get(refused) === started) running.delete(refused);
      });
      if (running.size < SHARED) running.set(refused, started);
      return started;
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
