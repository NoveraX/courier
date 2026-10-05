import { cn } from "@/lib/utils";

/**
 * Where a page's content will be once Studio sends it: busy, announced as
 * loading to assistive technology, holding blocks shaped like the content.
 *
 * @param props - What is loading, the region's layout, and its blocks
 * @returns The region
 * @example
 * ```tsx
 * <LoadingRegion label="Loading the APIs" className="flex flex-col gap-3">
 *   <Skeleton className="h-40" />
 * </LoadingRegion>
 * ```
 */
export function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div aria-busy="true" className={cn("min-w-0", className)}>
      <span role="status" className="sr-only">
        {label}
      </span>
      {children}
    </div>
  );
}
