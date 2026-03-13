import { Link } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";

export function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-text-muted">
      <FileQuestion size={48} strokeWidth={1} className="text-text-muted/50" />
      <div className="text-center">
        <h2 className="text-lg font-medium text-text-primary">Page not found</h2>
        <p className="mt-1 text-sm">The page you're looking for doesn't exist.</p>
      </div>
      <Link
        to="/timeline"
        className="rounded-lg bg-indigo-500/15 px-4 py-2 text-sm text-indigo-400 transition-colors hover:bg-indigo-500/25"
      >
        Go to Timeline
      </Link>
    </div>
  );
}
