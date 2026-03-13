import { Link } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <FileQuestion size={48} strokeWidth={1} className="text-muted-foreground/50" />
      <div className="text-center">
        <h2 className="text-lg font-medium text-foreground">Page not found</h2>
        <p className="mt-1 text-sm">The page you're looking for doesn't exist.</p>
      </div>
      <Button variant="outline" asChild>
        <Link to="/timeline">Go to Timeline</Link>
      </Button>
    </div>
  );
}
