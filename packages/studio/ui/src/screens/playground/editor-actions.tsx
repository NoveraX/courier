import { cn } from "@/lib/utils";

const TEXT_BUTTON =
  "h-6.5 cursor-pointer rounded-[6px] px-2.25 text-small text-fg-subtle hover:bg-raised hover:text-fg pointer-coarse:h-9 pointer-coarse:px-2.5";

interface EditorActionsProps {
  /** Whether the editor's text differs from the text it started from. */
  changed: boolean;
  onPrettify: () => void;
  onReset: () => void;
}

/**
 * The editor's Prettify, which lays its JSON out, and Reset, which puts
 * back the text it started from — off until the text changes.
 *
 * @param props - Whether the text changed, and what the two buttons do
 * @returns The two buttons
 * @example
 * ```tsx
 * <EditorActions changed={editor.changed} onPrettify={prettify} onReset={editor.onReset} />
 * ```
 */
export function EditorActions({
  changed,
  onPrettify,
  onReset,
}: EditorActionsProps): React.ReactNode {
  return (
    <>
      <button type="button" onClick={onPrettify} className={TEXT_BUTTON}>
        Prettify
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={!changed}
        className={cn(TEXT_BUTTON, "disabled:cursor-default disabled:opacity-50")}
      >
        Reset
      </button>
    </>
  );
}
