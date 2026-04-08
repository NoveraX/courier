/**
 * Dropdown menu rendered in the top-right of a RegistryCard.
 */

import { MoreHorizontal, RefreshCw, Settings2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CardMenuProps {
  isUrl: boolean;
  isChecking?: boolean;
  onCheckUpdates: () => void;
  onManage: () => void;
  onRemove: () => void;
}

export function CardMenu({
  isUrl,
  isChecking,
  onCheckUpdates,
  onManage,
  onRemove,
}: CardMenuProps): React.ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onManage}>
          <Settings2 className="size-3.5" />
          Manage endpoints
        </DropdownMenuItem>
        {isUrl && (
          <DropdownMenuItem onClick={onCheckUpdates} disabled={isChecking}>
            <RefreshCw className="size-3.5" />
            Check updates
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          <Trash2 className="size-3.5" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
