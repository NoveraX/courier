import type { DatabaseSync } from "node:sqlite";

import { readObservations, writeObservations } from "./answer-observation-rows";

/** A field seen in an endpoint's answers, with one of the JSON types it came as. */
export interface FieldSeen {
  /** `user.id`, `items[].price`; `""` for the answer itself */
  path: string;
  type: string;
  firstSeen: number;
  lastSeen: number;
  /** In how many answers it came as this type */
  count: number;
  /** Where the answers came from: the hosts that sent them */
  places: string[];
}

/** What an endpoint's answers have been seen to hold. */
export interface EndpointSeen {
  source: string;
  endpoint: string;
  /** How many answers were seen */
  calls: number;
  firstSeen: number;
  lastSeen: number;
  /** How many answers were too large or too deep to see whole, or brought fields past the limit */
  cut: number;
  fields: FieldSeen[];
}

/** One answer's shape, as it is counted. */
export interface AnswerSeen {
  source: string;
  endpoint: string;
  shape: Readonly<Record<string, string>>;
  cut: boolean;
  /** The host the answer came from, when the request's address is known */
  place: string | undefined;
  at: number;
}

/** The fields Studio has seen in each endpoint's answers, kept in its database. */
export interface AnswerObservations {
  /** Count one answer's shape */
  observe(answer: AnswerSeen): void;
  of(source: string, endpoint: string): EndpointSeen | undefined;
  all(): EndpointSeen[];
  /** Forget what was seen of one endpoint */
  forget(source: string, endpoint: string): void;
  clear(): void;
  /** Write what was seen since the last write */
  flush(): void;
  close(): void;
}

/* Observations stay small whatever the traffic: so many endpoints, fields and hosts at most. */
const MOST_ENDPOINTS = 1000;
const MOST_FIELDS = 500;
const MOST_PLACES = 10;
const FLUSH_EVERY_MS = 2000;

interface Tracked {
  seen: EndpointSeen;
  /** Each field by its path and type */
  index: Map<string, FieldSeen>;
}

const fieldKey = (path: string, type: string): string => `${path}\u0000${type}`;
const endpointKey = (source: string, endpoint: string): string => `${source}\u0000${endpoint}`;

/**
 * The fields seen in each endpoint's answers — each with its type, when it
 * was first and last seen, how often, and from which hosts — counted in
 * memory and written to Studio's database every two seconds, so heavy
 * traffic costs one write per endpoint, not one per answer. Bounded: so
 * many endpoints and fields, so many hosts per field; an answer past a bound
 * is counted as cut.
 *
 * @param db - Studio's database
 * @returns The observations
 * @example
 * ```ts
 * const seen = createAnswerObservations(db);
 * seen.observe({ source: "shop", endpoint: "products.get", shape, cut: false, place: "api.example.com", at: Date.now() });
 * ```
 */
export function createAnswerObservations(db: DatabaseSync): AnswerObservations {
  const tracked = new Map<string, Tracked>();
  for (const seen of readObservations(db))
    tracked.set(endpointKey(seen.source, seen.endpoint), track(seen));
  const dirty = new Set<string>();
  const forgotten = new Map<string, readonly [string, string]>();
  const flush = () => {
    if (dirty.size === 0 && forgotten.size === 0) return;
    const written = [...dirty].flatMap((key) => tracked.get(key)?.seen ?? []);
    writeObservations(db, written, [...forgotten.values()]);
    dirty.clear();
    forgotten.clear();
  };
  const timer = setInterval(flush, FLUSH_EVERY_MS);
  timer.unref();
  return {
    observe(answer) {
      const key = endpointKey(answer.source, answer.endpoint);
      let entry = tracked.get(key);
      if (!entry) {
        if (tracked.size >= MOST_ENDPOINTS) return;
        entry = track({
          ...answer,
          calls: 0,
          firstSeen: answer.at,
          lastSeen: answer.at,
          cut: 0,
          fields: [],
        });
        tracked.set(key, entry);
      }
      entry.seen.calls++;
      entry.seen.lastSeen = answer.at;
      if (countFields(entry, answer) || answer.cut) entry.seen.cut++;
      dirty.add(key);
      forgotten.delete(key);
    },
    of: (source, endpoint) => tracked.get(endpointKey(source, endpoint))?.seen,
    all: () => [...tracked.values()].map((entry) => entry.seen),
    forget(source, endpoint) {
      const key = endpointKey(source, endpoint);
      tracked.delete(key);
      dirty.delete(key);
      forgotten.set(key, [source, endpoint]);
      flush();
    },
    clear() {
      for (const [key, { seen }] of tracked) forgotten.set(key, [seen.source, seen.endpoint]);
      tracked.clear();
      dirty.clear();
      flush();
    },
    flush,
    close() {
      clearInterval(timer);
      flush();
    },
  };
}

function track({
  source,
  endpoint,
  calls,
  firstSeen,
  lastSeen,
  cut,
  fields,
}: EndpointSeen): Tracked {
  const seen = { source, endpoint, calls, firstSeen, lastSeen, cut, fields };
  return { seen, index: new Map(fields.map((field) => [fieldKey(field.path, field.type), field])) };
}

/* Count each place's types in one answer; whether a field past the limit was left out. */
function countFields({ seen, index }: Tracked, { shape, place, at }: AnswerSeen): boolean {
  let leftOut = false;
  for (const [path, types] of Object.entries(shape)) {
    for (const type of types.split("|")) {
      const key = fieldKey(path, type);
      let field = index.get(key);
      if (!field) {
        if (seen.fields.length >= MOST_FIELDS) {
          leftOut = true;
          continue;
        }
        field = { path, type, firstSeen: at, lastSeen: at, count: 0, places: [] };
        seen.fields.push(field);
        index.set(key, field);
      }
      field.count++;
      field.lastSeen = at;
      if (place && !field.places.includes(place) && field.places.length < MOST_PLACES) {
        field.places.push(place);
      }
    }
  }
  return leftOut;
}
