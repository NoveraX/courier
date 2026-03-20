import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * PageShell — unified layout wrapper for all page views.
 *
 * Solves the flex `min-height: auto` problem once and for all.
 * Every page MUST use this instead of hand-rolling flex containers.
 *
 * @example
 * // Scrollable page (analytics, overview)
 * <PageShell>
 *   <div className="p-5 space-y-5">content...</div>
 * </PageShell>
 *
 * @example
 * // Toolbar + scroll (heatmap, endpoints)
 * <PageShell toolbar={<MyToolbar />} footer={<MyLegend />}>
 *   <div>scrollable content...</div>
 * </PageShell>
 *
 * @example
 * // No scroll — page manages its own (React Flow, virtual scroll)
 * <PageShell toolbar={<Toolbar />} noScroll>
 *   <ReactFlow />
 * </PageShell>
 *
 * @example
 * // Centered empty state — use `center` prop, NOT ScrollArea
 * <PageShell toolbar={<Toolbar />} center>
 *   <EmptyState ... />
 * </PageShell>
 */

interface PageShellProps {
  children: React.ReactNode;
  /** Fixed toolbar rendered above content */
  toolbar?: React.ReactNode;
  /** Fixed footer rendered below content */
  footer?: React.ReactNode;
  /** Additional className on the outer wrapper */
  className?: string;
  /** Disable built-in ScrollArea (React Flow, virtual scroll) */
  noScroll?: boolean;
  /** Center children vertically and horizontally (empty states) */
  center?: boolean;
}

export function PageShell({
  children,
  toolbar,
  footer,
  className,
  noScroll = false,
  center = false,
}: PageShellProps): React.ReactElement {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      {toolbar && <div className="shrink-0">{toolbar}</div>}

      {center ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          {children}
        </div>
      ) : noScroll ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {children}
        </ScrollArea>
      )}

      {footer && <div className="shrink-0">{footer}</div>}
    </div>
  );
}
