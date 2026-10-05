/** An answer the mock did not make itself. */
export interface ElsewhereAnswer {
  status: number;
  headers: Record<string, string>;
  data: unknown;
  /** Where it came from: the source's own server just now, or a recording of it. */
  from: "upstream" | "recording";
}

/** A call the mock leaves to the source's own server. */
export interface ElsewhereCall {
  group: string;
  method: string;
  variables: unknown;
  /** The request's headers worth sending on, such as its credentials. */
  headers: Record<string, string>;
  /** Keep the answer, to replay it to the same call from then on. */
  record: boolean;
}

/**
 * The calls a mock does not answer itself: the endpoints it leaves to the
 * source's own server, and those it answers with recordings of that server.
 */
export interface Elsewhere {
  /** Whether the mock leaves this endpoint to the source's own server. */
  passes(group: string, method: string): boolean;
  /** Whether the mock answers this endpoint with recordings of the source's server. */
  replays(group: string, method: string): boolean;
  /** A recorded answer to this exact call, when there is one. */
  recorded(group: string, method: string, variables: unknown): ElsewhereAnswer | undefined;
  /**
   * Ask the source's own server, as the app calls it.
   *
   * @throws {Error} When the server could not be reached
   */
  ask(call: ElsewhereCall): Promise<ElsewhereAnswer>;
}
