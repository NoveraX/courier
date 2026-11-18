/**
 * What the page and the stand agree on: the room the page's connections
 * subscribe to, what its channel says, and what the page reports of each
 * connection it opened.
 */

/** The topic the page's connections subscribe to, and the replica numbers its events on. */
export const ROOM = "api.live.room";

/** The token the replica admits a connection with; any other it refuses. */
export const ADMITTED = "admitted";

/** What the room says: its snapshot as a connection joins, a numbered event, an echo of a message sent. */
export type Said = { readonly snapshot: true } | { readonly n: number } | { readonly echo: string };

/** What a connection the page opened has heard, and where it stands. */
export interface Heard {
  /** Its state's phase */
  readonly phase: string;
  /** What carries it, while it is open */
  readonly transport: string | undefined;
  /** The code it failed with, once it has */
  readonly code: number | undefined;
  /** How many times its credentials were asked for */
  readonly asked: number;
  /** Each time its subscription opened, whether it resumed where it stood */
  readonly opens: readonly boolean[];
  /** The subscription's first payload */
  readonly first: Said | undefined;
  /** The numbers of the events it heard, in the order it heard them, each the first time */
  readonly ns: readonly number[];
  /** Events it heard a second time */
  readonly twice: number;
  /** What the room echoed of the messages it sent */
  readonly echoes: readonly string[];
  /** Each transport that carried it while it was open, in turn */
  readonly transports: readonly string[];
}

/** What the page lets a check do, as `window.realtime`. */
export interface RealtimePage {
  /** Open a connection to `url` as `userId`, subscribed to the room: its number */
  open(url: string, userId: string): number;
  /** What the connection has heard so far */
  heard(id: number): Heard;
  /** Send `text` to the room on the connection */
  send(id: number, text: string): void;
  /** The token the connection's credentials say from now on */
  setToken(id: number, token: string): void;
  /** Close the connection */
  close(id: number): void;
}

declare global {
  interface Window {
    realtime: RealtimePage;
  }
}
