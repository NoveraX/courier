import { Link } from "@tanstack/react-router";
import { ArrowLeft, Search } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NotFound(): React.ReactNode {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <Search className="size-7 text-muted-foreground" />
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h1 text-foreground">Page not found</h1>
        <p className="text-body text-muted-foreground max-w-sm">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/timeline">
          <ArrowLeft className="size-3.5" />
          Back to Timeline
        </Link>
      </Button>
    </div>
  );
}
