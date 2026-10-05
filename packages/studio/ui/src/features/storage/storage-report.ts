import { isPlainObject } from "@/socket/is-plain-object";

/** One of what Studio keeps, which the Storage settings size and clear on its own. */
export type StorageKind =
  | "requests"
  | "mockLogs"
  | "playground"
  | "sessions"
  | "mockStores"
  | "backups";

/** How much one kind takes, how many it holds, and how many Studio keeps at most. */
export interface KindReport {
  kind: StorageKind;
  bytes: number;
  count: number;
  limit?: number | undefined;
}

/** What Studio keeps in `.courier/` and how much room it takes, as Studio measured it. */
export interface StorageReport {
  folder: string;
  persistent: boolean;
  database: { onDisk: number; data: number; free: number };
  kinds: KindReport[];
}

/** Every kind, in the order the settings list them. */
export const STORAGE_KINDS: readonly StorageKind[] = [
  "requests",
  "mockLogs",
  "playground",
  "sessions",
  "mockStores",
  "backups",
];

/** Each kind's name and what it is. */
export const KIND_INFO: Readonly<Record<StorageKind, { label: string; what: string }>> = {
  requests: { label: "Captured requests", what: "The requests the Timeline shows, and replays" },
  mockLogs: { label: "Mock logs", what: "The requests each mock answered" },
  playground: { label: "Playground history", what: "The calls sent from the Playground" },
  sessions: { label: "Saved sessions", what: "The sessions saved to load again" },
  mockStores: { label: "Mock stores", what: "The records each mock keeps; reset to its seeds" },
  backups: {
    label: "Import backups",
    what: "Copies of the files imports replaced; an undo's stay",
  },
};

function isKind(value: unknown): value is StorageKind {
  return typeof value === "string" && Object.hasOwn(KIND_INFO, value);
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function kindOf(value: unknown): KindReport | undefined {
  if (!isPlainObject(value) || !isKind(value.kind)) return undefined;
  if (!isCount(value.bytes) || !isCount(value.count)) return undefined;
  const limit = isCount(value.limit) ? value.limit : undefined;
  return { kind: value.kind, bytes: value.bytes, count: value.count, limit };
}

/**
 * Read Studio's storage report, as it arrives over the wire.
 *
 * @param raw - What `/api/storage` answered
 * @returns The report, or `undefined` for an answer of another shape
 * @example
 * ```ts
 * const report = readStorageReport(await post("/api/storage"));
 * ```
 */
export function readStorageReport(raw: unknown): StorageReport | undefined {
  if (!isPlainObject(raw) || typeof raw.folder !== "string" || typeof raw.persistent !== "boolean")
    return undefined;
  const { database } = raw;
  if (!isPlainObject(database) || !isCount(database.onDisk) || !isCount(database.data))
    return undefined;
  if (!isCount(database.free) || !Array.isArray(raw.kinds)) return undefined;
  const kinds = raw.kinds.map(kindOf).filter((kind) => kind !== undefined);
  return {
    folder: raw.folder,
    persistent: raw.persistent,
    database: { onDisk: database.onDisk, data: database.data, free: database.free },
    kinds,
  };
}
