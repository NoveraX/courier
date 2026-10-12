type RuntimeEvent = Record<string, unknown>;

/** The runtime events of the latest requests Studio has seen, kept in its database. */
export interface RequestLog {
  /** Keep an event a runtime sent, once it has been passed to the UI. */
  record: (event: RuntimeEvent, owner: string) => void;
  /** The kept events a page is sent as it connects: the newest requests', each whole and in the order its events arrived, as many as fit the replay, oldest request first. */
  events: () => RuntimeEvent[];
  /** The events that open and end every kept request, without the bodies and headers they carry, the earliest request first: what a list of requests, and each endpoint's figures, are made of. */
  keyEvents: () => RuntimeEvent[];
  /** One kept request's events, whole, in the order they arrived; none for a request the log does not keep. */
  eventsOf: (id: string) => RuntimeEvent[];
  /** A number that changes whenever the log does: an event kept, a request let go. */
  version: () => number;
  /** End the requests a runtime socket left open; returns the events that end them, already kept. */
  endOpen: (owner: string) => RuntimeEvent[];
  /** Forget every request but the ones named. */
  forget: (keep: ReadonlySet<string>) => void;
  /** Write what is kept to the database, and keep nothing more: the database is closing. */
  close: () => void;
}
