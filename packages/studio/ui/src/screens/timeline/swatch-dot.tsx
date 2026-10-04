const SWATCH: Readonly<Record<string, string>> = {
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
  brand: "bg-brand",
  muted: "bg-fg-subtle",
  keyword: "bg-syntax-keyword",
  get: "bg-method-get",
  post: "bg-method-post",
  put: "bg-method-put",
  patch: "bg-method-patch",
  delete: "bg-method-delete",
};

/**
 * The colour dot beside a filter's value: its state's, its method's, its
 * transport's.
 *
 * @param props - The swatch's name, as the filter's options give it
 * @returns The dot, or nothing for a name Studio does not colour
 * @example
 * ```tsx
 * <SwatchDot swatch="err" />
 * ```
 */
export function SwatchDot({ swatch }: { swatch: string }): React.ReactNode {
  const fill = SWATCH[swatch];
  if (!fill) return null;
  return <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${fill}`} />;
}
