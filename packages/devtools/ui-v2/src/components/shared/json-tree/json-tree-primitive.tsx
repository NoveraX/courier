import { cn } from "@/lib/utils";

interface JsonTreePrimitiveProps {
  value: unknown;
}

const VALUE_STYLES: Record<string, string> = {
  string: "text-emerald-400",
  number: "text-sky-400",
  boolean: "text-amber-400",
  null: "text-orange-400",
  undefined: "text-orange-400/70",
};

export function JsonTreePrimitive({
  value,
}: JsonTreePrimitiveProps): React.ReactElement {
  const { display, type } = formatValue(value);

  return (
    <span className={cn("text-mono-sm", VALUE_STYLES[type])}>
      {display}
    </span>
  );
}

function formatValue(value: unknown): { display: string; type: string } {
  if (value === null) return { display: "null", type: "null" };
  if (value === undefined) return { display: "undefined", type: "undefined" };

  if (typeof value === "string") {
    const truncated = value.length > 120 ? `${value.slice(0, 119)}…` : value;
    return { display: `"${truncated}"`, type: "string" };
  }

  if (typeof value === "number") return { display: String(value), type: "number" };
  if (typeof value === "boolean") return { display: String(value), type: "boolean" };

  return { display: String(value), type: "string" };
}
