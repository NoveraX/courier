import type { LucideIcon } from "lucide-react";
import { ChevronDown, Code, Copy, Send, Terminal } from "lucide-react";
import { DropdownMenu } from "radix-ui";

import type { SnippetFlavor } from "@/features/requests/request-snippets";
import { snippetLabels } from "@/features/requests/request-snippets";

const ICONS: Readonly<Record<SnippetFlavor, LucideIcon>> = {
  shell: Terminal,
  browser: Code,
  courier: Send,
};

interface CopyAsMenuProps {
  transport: "http" | "sse" | "ws";
  onCopy: (flavor: SnippetFlavor, label: string) => void;
}

/**
 * Copies the call as code: cURL or websocat, fetch or the browser's own,
 * or the Courier client.
 *
 * @param props - The endpoint's transport, and what copying a flavour does
 * @returns The menu
 * @example
 * ```tsx
 * <CopyAsMenu transport="http" onCopy={copy} />
 * ```
 */
export function CopyAsMenu({ transport, onCopy }: CopyAsMenuProps): React.ReactNode {
  const labels = snippetLabels({ transport: transport === "http" ? undefined : transport });
  const flavors: readonly SnippetFlavor[] = ["shell", "browser", "courier"];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex h-6.5 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line px-2.25 text-small text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:border-line-strong">
        <Copy aria-hidden="true" className="size-3" />
        Copy as
        <ChevronDown aria-hidden="true" className="size-2.75 opacity-60" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          data-shell=""
          align="end"
          sideOffset={6}
          className="z-50 w-47.5 animate-pop-in rounded-panel bg-panel p-1 shadow-overlay"
        >
          {flavors.map((flavor) => {
            const Icon = ICONS[flavor];
            return (
              <DropdownMenu.Item
                key={flavor}
                onSelect={() => onCopy(flavor, labels[flavor])}
                className="flex h-7.5 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.25 text-control text-fg-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-fg"
              >
                <Icon aria-hidden="true" className="size-3.25" />
                {labels[flavor]}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
