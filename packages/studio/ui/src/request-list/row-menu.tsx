import type { LucideIcon } from "lucide-react";
import { Pin, PinOff, RotateCcw } from "lucide-react";
import { ContextMenu } from "radix-ui";
import { useState } from "react";
import { POP_MOTION } from "@/design/overlay-motion";
import { useTogglePin } from "@/hooks/use-toggle-pin";
import { requestCopyActions } from "@/inspector/request-copy-actions";
import { useReplay } from "@/inspector/use-replay";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";

interface RowMenuProps {
  children: React.ReactNode;
}

/**
 * The menu a right click on a request's row opens — a long press under a
 * finger, which selects no text on the way: copy the request as cURL,
 * fetch or JSON, download it, replay it, pin it.
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
  /* A press away from a request's row — a group's head, the space under the rows — opens nothing. */
  const aim = (event: React.SyntheticEvent) => {
    const id = rowIdOf(event.target);
    if (id) setTargetId(id);
    else event.preventDefault();
  };
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        asChild
        onContextMenu={aim}
        onPointerDown={(event) => event.pointerType !== "mouse" && aim(event)}
        className="touch-row"
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          collisionPadding={8}
          className={cn("z-50 w-55 rounded-[9px] bg-panel p-1.25 shadow-overlay", POP_MOTION)}
        >
          {request && <Items request={request} />}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/* The request a press landed on: a long press under a finger opens the menu
   without a context-menu event, so the row is known from the press itself. */
function rowIdOf(target: EventTarget): string | undefined {
  const row = target instanceof Element ? target.closest("[data-request-id]") : null;
  return row?.getAttribute("data-request-id") ?? undefined;
}

function Items({ request }: { request: RequestEntry }): React.ReactNode {
  const togglePin = useTogglePin();
  const replay = useReplay()(request);
  const [curlCopy, fetchCopy, jsonCopy, download] = requestCopyActions(request);
  return (
    <>
      {[curlCopy, fetchCopy, jsonCopy].map(({ key, icon, label, onSelect }) => (
        <Item key={key} icon={icon} onSelect={onSelect}>
          {label}
        </Item>
      ))}
      <ContextMenu.Separator className="mx-0.5 my-1 h-px bg-line" />
      <Item icon={download.icon} onSelect={download.onSelect}>
        {download.label}
      </Item>
      <Item icon={RotateCcw} disabled={!replay.run} onSelect={() => replay.run?.()}>
        {replay.label}
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
      className="flex h-7.5 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.25 text-control text-fg-muted outline-none data-disabled:cursor-default data-disabled:opacity-45 data-highlighted:bg-raised data-highlighted:text-fg pointer-coarse:h-10"
    >
      <Icon aria-hidden="true" className="size-3.25 w-3.5" />
      {children}
    </ContextMenu.Item>
  );
}
