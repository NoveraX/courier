import type { LucideIcon } from "lucide-react";
import { Code, Download, FileJson, Pin, PinOff, RotateCcw, Terminal } from "lucide-react";
import { ContextMenu } from "radix-ui";
import { useState } from "react";

import { endpointName } from "@/features/requests/request-parts";
import { requestAsJson, requestSnippet } from "@/features/requests/request-snippets";
import { useReplay } from "@/inspector/use-replay";
import { copyToClipboard } from "@/lib/clipboard";
import { downloadFile } from "@/lib/export";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";

interface RowMenuProps {
  children: React.ReactNode;
}

/**
 * The menu a right click on a Timeline row opens: copy the request as
 * cURL, fetch or JSON, download it, replay it, pin it.
 *
 * @param props - The rows it serves
 * @returns The rows, with the menu
 * @example
 * ```tsx
 * <RowMenu><div>{rows}</div></RowMenu>
 * ```
 */
export function RowMenu({ children }: RowMenuProps): React.ReactNode {
  const [targetId, setTargetId] = useState<string | null>(null);
  const request = useStudioStore((s) =>
    targetId ? s.requests.find((r) => r.id === targetId) : undefined,
  );
  const onContextMenu = (event: React.MouseEvent) => {
    const row = event.target instanceof Element ? event.target.closest("[data-request-id]") : null;
    const id = row?.getAttribute("data-request-id");
    if (!id) {
      event.preventDefault();
      return;
    }
    setTargetId(id);
  };
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild onContextMenu={onContextMenu}>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          data-shell=""
          className="z-50 w-55 animate-pop-in rounded-[9px] bg-panel p-1.25 shadow-overlay"
        >
          {request && <Items request={request} />}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function Items({ request }: { request: RequestEntry }): React.ReactNode {
  const togglePin = useStudioStore((s) => s.togglePin);
  const { run: replay } = useReplay()(request);
  const name = endpointName(request);
  const json = () => requestAsJson(request);
  return (
    <>
      <Item
        icon={Terminal}
        onSelect={() => void copyToClipboard(requestSnippet(request, "shell").code, "as cURL")}
      >
        Copy as cURL
      </Item>
      <Item
        icon={Code}
        onSelect={() => void copyToClipboard(requestSnippet(request, "browser").code, "as fetch")}
      >
        Copy as fetch
      </Item>
      <Item icon={FileJson} onSelect={() => void copyToClipboard(json(), "as JSON")}>
        Copy as JSON
      </Item>
      <ContextMenu.Separator className="mx-0.5 my-1 h-px bg-line" />
      <Item icon={Download} onSelect={() => downloadFile(json(), `${name}-${request.id}.json`)}>
        Download JSON
      </Item>
      <Item icon={RotateCcw} disabled={!replay} onSelect={() => replay?.()}>
        Replay request
      </Item>
      <ContextMenu.Separator className="mx-0.5 my-1 h-px bg-line" />
      <Item icon={request.pinned ? PinOff : Pin} onSelect={() => togglePin(request.id)}>
        {request.pinned ? "Unpin" : "Pin request"}
      </Item>
    </>
  );
}

interface ItemProps {
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean | undefined;
  children: React.ReactNode;
}

function Item({ icon: Icon, onSelect, disabled, children }: ItemProps): React.ReactNode {
  return (
    <ContextMenu.Item
      disabled={disabled === true}
      onSelect={onSelect}
      className="flex h-7.5 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.25 text-control text-fg-muted outline-none data-disabled:cursor-default data-disabled:opacity-45 data-highlighted:bg-raised data-highlighted:text-fg"
    >
      <Icon aria-hidden="true" className="size-3.25 w-3.5" />
      {children}
    </ContextMenu.Item>
  );
}
