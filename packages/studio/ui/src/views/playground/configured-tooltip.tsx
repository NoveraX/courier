const CODE_PILL =
  "rounded-sm border border-background/10 bg-accent-brand/15 px-1.5 py-px font-mono font-medium";

/**
 * What a configured proxy path's tooltip says: where the endpoint is
 * mounted — on the app at its origin, outside the app, or on the app with
 * no `appOrigin` to resolve the full URL from — and where it is configured.
 *
 * @param props.transport - The transport whose proxy path it is
 * @param props.kind - How the displayed URL was resolved
 * @param props.appOrigin - The app's origin, when set
 * @returns The tooltip's content
 *
 * @example
 * ```tsx
 * <ConfiguredTooltip transport="sse" kind="resolved" appOrigin="http://localhost:3000" />
 * ```
 */
export function ConfiguredTooltip({
  transport,
  kind,
  appOrigin,
}: {
  transport: "http" | "sse" | "ws";
  kind: "absolute" | "resolved" | "unresolved";
  appOrigin: string | undefined;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5 leading-relaxed">
      {kind === "resolved" && appOrigin && (
        <div>
          <span className="opacity-55">Mounted on your app at </span>
          <code className={CODE_PILL}>{appOrigin}</code>
        </div>
      )}
      {kind === "absolute" && (
        <div>
          <span className="opacity-55">External endpoint — outside your app process</span>
        </div>
      )}
      {kind === "unresolved" && (
        <div>
          <span className="opacity-55">Mounted on your app — set </span>
          <code className={CODE_PILL}>appOrigin</code>
          <span className="opacity-55"> on instrumentServer to resolve the full URL</span>
        </div>
      )}
      <div>
        <span className="opacity-55">Configured in </span>
        <code className={CODE_PILL}>defineApi(&#123; proxyPath.{transport} &#125;)</code>
      </div>
    </div>
  );
}
