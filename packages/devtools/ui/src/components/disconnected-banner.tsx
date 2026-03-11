export function DisconnectedBanner() {
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
      <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      <span className="text-[11px] text-amber-400">
        Not connected to DevTools server — data may be stale
      </span>
    </div>
  )
}
