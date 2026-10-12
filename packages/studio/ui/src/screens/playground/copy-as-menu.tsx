import type { LucideIcon } from "lucide-react";
import { ChevronDown, Code, Copy, Link, Send, Terminal } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { POP_MOTION } from "@/design/overlay-motion";
import type { SnippetFlavor } from "@/features/requests/request-snippets";
import { snippetLabels } from "@/features/requests/request-snippets";
import { cn } from "@/lib/utils";

/** What the call can be copied as: code of a flavour, or its URL alone. */
export type CopyChoice = SnippetFlavor | "url";

const ICONS: Readonly<Record<CopyChoice, LucideIcon>> = {
  shell: Terminal,
  browser: Code,
  courier: Send,
  url: Link,
};

interface CopyAsMenuProps {
  transport: "http" | "sse" | "ws";
  onCopy: (choice: CopyChoice, label: string) => void;
}

/**
 * Copies the call as code — cURL or websocat, fetch or the browser's own,
 * or the Courier client — or its URL alone.
 *
 * @param props - The endpoint's transport, and what copying does
 * @returns The menu
 * @example
 * ```tsx
 * <CopyAsMenu transport="http" onCopy={copy} />
 * ```
 */
export function CopyAsMenu({ transport, onCopy }: CopyAsMenuProps): React.ReactNode {
  const labels: Readonly<Record<CopyChoice, string>> = {
    ...snippetLabels({ transport: transport === "http" ? undefined : transport }),
    url: "URL",
  };
  const choices: readonly CopyChoice[] = ["shell", "browser", "courier", "url"];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex h-6.5 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line px-2.25 text-small text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:border-line-strong pointer-coarse:h-9 pointer-coarse:px-2.5">
        <Copy aria-hidden="true" className="size-3" />
        Copy as
        <ChevronDown aria-hidden="true" className="size-2.75 opacity-60" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn("z-50 w-47.5 rounded-panel bg-panel p-1 shadow-overlay", POP_MOTION)}
        >
          {choices.map((choice) => {
            const Icon = ICONS[choice];
            return (
              <DropdownMenu.Item
                key={choice}
                onSelect={() => onCopy(choice, labels[choice])}
                className="flex h-7.5 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.25 text-control text-fg-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-fg pointer-coarse:h-10"
              >
                <Icon aria-hidden="true" className="size-3.25" />
                {labels[choice]}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
