import { FRAMEWORKS } from "@/features/welcome/frameworks";
import { cn } from "@/lib/utils";

interface FrameworkGridProps {
  selected: string | null;
  onSelect: (id: string) => void;
  /** The app attached, when one is: what Studio sees running. */
  attached: string | undefined;
}

/**
 * The frameworks Studio sets up, as tiles: the name, and what the setup
 * hooks into.
 *
 * @param props - The framework picked, what picks one, and the app attached
 * @returns The grid, under its heading
 * @example
 * ```tsx
 * <FrameworkGrid selected="nextjs" onSelect={select} attached={undefined} />
 * ```
 */
export function FrameworkGrid({
  selected,
  onSelect,
  attached,
}: FrameworkGridProps): React.ReactNode {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2.5">
        <span className="font-semibold">Framework</span>
        {attached && (
          <span className="font-mono text-badge text-fg-subtle">attached: {attached}</span>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1.5">
        {FRAMEWORKS.map((framework) => {
          const on = framework.id === selected;
          return (
            <button
              key={framework.id}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(framework.id)}
              className={cn(
                "flex cursor-pointer flex-col items-start gap-0.75 rounded-card border px-2.75 py-2.25 text-left text-fg transition-colors hover:border-line-strong",
                on ? "border-brand bg-brand-dim" : "border-line bg-panel",
              )}
            >
              <span className="font-strong">{framework.name}</span>
              <span className={cn("font-mono text-meta", on ? "text-brand" : "text-fg-subtle")}>
                {framework.tag}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
