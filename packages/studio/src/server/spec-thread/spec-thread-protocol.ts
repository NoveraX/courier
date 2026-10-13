import type { GeneratedFile, GenerateOptions, ParsedSpec, SpecDiff } from "../../apis";

/**
 * The version of what Studio and its thread script say to each other. A
 * thread script built from other source — a `lib` older than the source
 * Studio runs from — says another, or nothing, and is not asked anything.
 * It changes whenever a job, a reply or the greeting changes shape.
 */
export const SPEC_THREAD_PROTOCOL = 3;

/** What a thread says once its script has loaded, before it answers any job. */
export interface ThreadReady {
  kind: "thread:ready";
  protocol: number;
}

/** A specification to read as the parse route answers it. */
export interface SpecReadJob {
  kind: "spec:read";
  /** The text: pasted, fetched, or read from a file of the project. */
  text: string;
  /** The URL it was fetched from, which a relative server address is resolved against. */
  url?: string | undefined;
  /** The most the specification may be as JSON: what its caller can send back; 0 when it needs its hash alone. */
  maxBytes: number;
  /** Whether to reply with the specification's hash too, which an update check compares with the one recorded. */
  hash?: boolean | undefined;
}

/** A specification to generate an import's code from. */
export interface SpecGenerateJob {
  kind: "spec:generate";
  spec: ParsedSpec;
  options: GenerateOptions;
}

/** Two specifications to compare. */
export interface SpecDiffJob {
  kind: "spec:diff";
  oldSpec: ParsedSpec;
  newSpec: ParsedSpec;
}

/** What a thread is asked to do. */
export type SpecJob = SpecReadJob | SpecGenerateJob | SpecDiffJob;

/** A job's input is at fault — no specification, a layout refused — and the message says why. */
export interface SpecJobRefusal {
  kind: SpecJob["kind"];
  refused: string;
}

/** What a job yields when its input is fine. */
export type SpecJobResult =
  | { kind: "spec:read"; json: string; hash?: string | undefined }
  /** The specification is larger, as JSON, than the job's `maxBytes`. */
  | { kind: "spec:read"; tooLarge: number; hash?: string | undefined }
  | { kind: "spec:generate"; files: GeneratedFile[] }
  | { kind: "spec:diff"; diff: SpecDiff };

/** What a thread answers a job: its result, or why the job's input has none. */
export type SpecJobReply = SpecJobResult | SpecJobRefusal;

/** The reply to one kind of job. */
export type ReplyTo<TKind extends SpecJob["kind"]> =
  | Extract<SpecJobResult, { kind: TKind }>
  | SpecJobRefusal;

const KINDS: ReadonlySet<unknown> = new Set(["spec:read", "spec:generate", "spec:diff"]);

/* What each reply carries, besides a refusal, by the kind of its job. */
const RESULTS: Readonly<Record<SpecJob["kind"], readonly string[]>> = {
  "spec:read": ["json", "tooLarge"],
  "spec:generate": ["files"],
  "spec:diff": ["diff"],
};

function fieldOf(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

/**
 * Tell whether a thread's message is its greeting.
 *
 * @param value - The message
 * @returns Whether it is a {@link ThreadReady}
 * @example
 * ```ts
 * worker.on("message", (message) => isThreadReady(message) && check(message.protocol));
 * ```
 */
export function isThreadReady(value: unknown): value is ThreadReady {
  return (
    fieldOf(value, "kind") === "thread:ready" && typeof fieldOf(value, "protocol") === "number"
  );
}

/**
 * Tell whether a message to a thread is a job. Studio alone posts to its
 * threads, so the kind is what tells a job from a file to format.
 *
 * @param value - The message
 * @returns Whether it is a {@link SpecJob}
 * @example
 * ```ts
 * parentPort?.on("message", (message) => isSpecJob(message) && answer(message));
 * ```
 */
export function isSpecJob(value: unknown): value is SpecJob {
  return KINDS.has(fieldOf(value, "kind"));
}

/**
 * Tell whether a thread's message answers a job of the kind given.
 *
 * @param value - The message
 * @param kind - The kind of job the thread was given
 * @returns Whether it is the reply to such a job
 * @example
 * ```ts
 * worker.on("message", (message) => isReplyTo(message, "spec:read") && settle(message));
 * ```
 */
export function isReplyTo<TKind extends SpecJob["kind"]>(
  value: unknown,
  kind: TKind,
): value is ReplyTo<TKind> {
  if (fieldOf(value, "kind") !== kind) return false;
  if (typeof fieldOf(value, "refused") === "string") return true;
  return RESULTS[kind].some((key) => fieldOf(value, key) !== undefined);
}
