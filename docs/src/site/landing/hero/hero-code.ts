/**
 * The hero's two files: the definition, and a file that calls it. The
 * calls are typed into the second one a character at a time.
 *
 * @example
 * ```ts
 * SOURCES_FILE[1] // "const { endpoint } = courier()"
 * ```
 */
export const SOURCES_FILE: readonly string[] = [
  "// the only place your API is described",
  "const { endpoint } = courier()",
  "",
  "const users = defineGroup({",
  '  prefix: "users",',
  "  endpoints: {",
  '    getAll: endpoint.get("").response<User[]>(),',
  '    getById: endpoint.get(":id")',
  "      .variables<{ id: string }>()",
  "      .response<User>(),",
  '    create: endpoint.post("")',
  "      .variables<{ name: string; email: string }>()",
  "      .response<User>(),",
  "  },",
  "})",
  "",
  "export const api = defineApi({",
  "  baseURL: process.env.API_URL!,",
  "  groups: { users },",
  "})",
]

/**
 * The lines of the calling file once everything is typed, in order: the
 * comment, the read, its hint, the query, its hint, and the create the
 * type checker refuses.
 *
 * @example
 * ```ts
 * CALLS_FILE[7] // 'await caller.users.create({ name: "Ada" })'
 * ```
 */
export const CALLS_FILE: readonly string[] = [
  "// anywhere in the app — inferred, not generated",
  'const user = await caller.users.getById({ id: "5" })',
  "//    ^? User",
  "",
  'const { data } = q.users.useQuery("getAll")',
  "//      ^? User[]",
  "",
  'await caller.users.create({ name: "Ada" })',
]

/** Where typing pauses for the completion list: right after `caller.users.`. */
export const READ_STOP = "const user = await caller.users.".length

/** Where the second completion list opens, after `await caller.users.`. */
export const CREATE_STOP = "await caller.users.".length

/** Where the argument the type checker refuses starts on the create line. */
export const REFUSED_AT = "await caller.users.create(".length

/**
 * What the completion list offers on `caller.users.`: each endpoint with
 * the type the definition gives it.
 *
 * @example
 * ```ts
 * COMPLETIONS[1].name // "getById"
 * ```
 */
export const COMPLETIONS: readonly { name: string; sig: string }[] = [
  { name: "getAll", sig: "() => Promise<User[]>" },
  { name: "getById", sig: "(variables: { id: string; }) => Promise<User>" },
  { name: "create", sig: "(variables: { name: string; email: string; }) => Promise<User>" },
]
