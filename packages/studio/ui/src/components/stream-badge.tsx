import { useStudioStore } from "@/store";

/** Compact inline stream count for status bar */
export function StreamBadge(): React.ReactElement | null {
  const count = useStudioStore(selectActiveStreamCount);
  if (count === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-emerald-400">
      <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
      <span className="tabular-nums">
        {count} stream{count > 1 ? "s" : ""}
      </span>
    </span>
  );
}

function selectActiveStreamCount(state: {
  requests: Array<{ streamStatus?: string | undefined }>;
}): number {
  return state.requests.filter((r) => r.streamStatus === "streaming").length;
}
