import type { SandboxLimits } from "./data/sandbox-store"

/**
 * Every limit the examples' backend keeps, in one place. The site's proxy
 * route takes its body limits from here too, so what a page may send is
 * the same on both hops.
 *
 * At its fullest the store holds `visitors` copies of the data, each with
 * `usersPerVisitor` users and `postsPerVisitor` posts whose every field is
 * as long as it may be: some 26 MiB, which a test measures and holds to
 * 40 MiB.
 */
export interface DemoLimits extends SandboxLimits {
  /**
   * Calls one caller makes in each `budgetMs`, and writes among them: the
   * budget of the visitor's address, and of the visitor too, every path
   * to the backend takes from.
   */
  readonly calls: number
  readonly writes: number
  readonly budgetMs: number
  /** Users one visitor keeps, the first data's own among them. */
  readonly usersPerVisitor: number
  /** Posts one visitor keeps, the first data's own among them. */
  readonly postsPerVisitor: number
  /** Characters in a user's name. */
  readonly nameLength: number
  /** Characters in an e-mail address: as many as SMTP carries. */
  readonly emailLength: number
  /** Characters in a post's title. */
  readonly titleLength: number
  /** Characters in a post's text. */
  readonly bodyLength: number
  /** Tags on a post, and characters in each. */
  readonly tags: number
  readonly tagLength: number
  /** Characters in a search for users. */
  readonly searchLength: number
  /** Users one page of the list holds at most, and the last page it reaches. */
  readonly pageSize: number
  readonly lastPage: number
  /** Bytes of a JSON or form body, and fields in a form. */
  readonly bodyBytes: number
  readonly formFields: number
  /** Bytes of an upload's file, its fields besides it, and bytes in each field. */
  readonly uploadBytes: number
  readonly uploadFields: number
  readonly uploadFieldBytes: number
  /** How long a call may take to arrive whole, and its headers alone. */
  readonly requestMs: number
  readonly headersMs: number
  /** How long the backend, asked to stop, lets the calls it is answering finish. */
  readonly shutdownMs: number
}

/** The limits the examples' backend runs with. */
export const DEMO_LIMITS: DemoLimits = {
  calls: 300,
  writes: 20,
  budgetMs: 60_000,
  visitors: 500,
  idleMs: 30 * 60_000,
  lifetimeMs: 2 * 60 * 60_000,
  usersPerVisitor: 30,
  postsPerVisitor: 20,
  nameLength: 80,
  emailLength: 254,
  titleLength: 120,
  bodyLength: 500,
  tags: 5,
  tagLength: 24,
  searchLength: 100,
  pageSize: 50,
  lastPage: 1000,
  bodyBytes: 16 * 1024,
  formFields: 100,
  uploadBytes: 1024 * 1024,
  uploadFields: 10,
  uploadFieldBytes: 1024,
  requestMs: 30_000,
  headersMs: 10_000,
  shutdownMs: 5_000,
}

/* What a form adds around its file and fields: a boundary and headers for each part. */
const FORM_PARTS_BYTES = 16 * 1024

/**
 * The most an upload's whole body may be, as the site's proxy route sends
 * it on: the largest file, every field at its longest, and the form's own
 * parts around them.
 *
 * @param limits - The backend's limits
 * @returns The bytes
 * @example
 * ```ts
 * apiRoute({ maxUploadBytes: uploadRequestBytes(DEMO_LIMITS) })
 * ```
 */
export function uploadRequestBytes(limits: DemoLimits): number {
  return limits.uploadBytes + limits.uploadFields * limits.uploadFieldBytes + FORM_PARTS_BYTES
}
