/**
 * The code each feature card shows: the call or the option that turns the
 * feature on, as Courier spells it.
 *
 * @example
 * ```ts
 * FEATURE_SNIPPETS.stream // "const body = await caller.chat\n  .with({ stream: true })\n  .ask({ q })"
 * ```
 */
export const FEATURE_SNIPPETS = {
  upload: [
    "await caller.files",
    "  .with({ onUploadProgress: (p) => setPct(p.percent * 100) })",
    "  .upload(form)",
  ].join("\n"),
  stream: ["const body = await caller.chat", "  .with({ stream: true })", "  .ask({ q })"].join(
    "\n"
  ),
  dedupe: [
    "// the same read in three components",
    'q.users.useQuery("getById", {',
    '  variables: { id: "5" },',
    "})",
  ].join("\n"),
  middleware: [
    "middleware: [",
    "  logMiddleware(),",
    "  retryMiddleware({ limit: 3 }),",
    "  authMiddleware({ getToken }),",
    "]",
  ].join("\n"),
  validation: [
    'create: endpoint.post("")',
    "  .variables(CreateUser)",
    "  .response(UserSchema)",
  ].join("\n"),
  errors: ["if (isHTTPError<ApiError>(error)", "    && error.status === 404) notFound()"].join(
    "\n"
  ),
} as const
