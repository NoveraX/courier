import { GroupHeader } from "./group-header";
import type { FlatItem } from "./types";
import { RowLabel } from "./waterfall-row";

interface LabelRowProps {
  item: FlatItem;
  top: number;
  height: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onToggleGroup: (key: string) => void;
}

/** Single virtual row in the sticky label column */
export function LabelRow({
  item,
  top,
  height,
  selectedId,
  onSelect,
  onToggleGroup,
}: LabelRowProps): React.ReactElement {
  return (
    <div className="absolute inset-x-0" style={{ top, height }}>
      {item.type === "group-header" ? (
        <GroupHeader
          group={item.group!}
          isCollapsed={item.isCollapsed ?? false}
          onToggle={() => onToggleGroup(item.group!.key)}
        />
      ) : (
        <RowLabel
          row={item.row!}
          index={item.rowIndex}
          onSelect={onSelect}
          isSelected={item.row!.request.id === selectedId}
        />
      )}
    </div>
  );
}
