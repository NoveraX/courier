import type { ShownField } from "@/features/playground/defaulted-fields";

import { cn } from "@/lib/utils";

interface SchemaTableProps {
  /** The endpoint's name, `group.method`. */
  name: string;
  /** The fields its variables schema declares, with its defaults; `undefined` when Studio cannot read them. */
  fields: readonly ShownField[] | undefined;
  /** Whether the endpoint declares a variables schema at all. */
  declared: boolean;
}

function splitPath(path: string): { parent: string; key: string } {
  const at = path.lastIndexOf(".");
  return { parent: path.slice(0, at + 1), key: path.slice(at + 1) };
}

/**
 * The input schema under the Variables editor: each field the endpoint's
 * schema declares, where it sits, its type and whether it is required — or
 * the default the endpoint sends when a call leaves it out. A
 * long type wraps rather than squeezing the field's name, and in a phone's
 * pane it takes a line of its own under the name.
 *
 * @param props - The endpoint's name, its fields, and whether it declares a schema
 * @returns The table
 * @example
 * ```tsx
 * <SchemaTable name="orders.create" fields={def.variablesFields} declared={def.hasVariablesSchema} />
 * ```
 */
export function SchemaTable({ name, fields, declared }: SchemaTableProps): React.ReactNode {
  const empty = !declared
    ? "This endpoint declares no input schema."
    : !fields
      ? "Studio cannot read this schema's fields."
      : fields.length === 0
        ? "This endpoint takes no input."
        : undefined;
  return (
    <section
      aria-label="Input schema"
      className="flex shrink-0 flex-col border-t border-line px-4.5 pt-3.5 pb-4.5"
    >
      <div className="flex items-baseline gap-2 pb-2">
        <h3 className="text-label font-semibold text-fg-muted">Input schema</h3>
        <span className="font-mono text-badge text-fg-subtle">{name}.input</span>
      </div>
      <div className="overflow-hidden rounded-panel border border-line">
        {empty && <p className="px-3 py-3.5 text-small text-fg-subtle">{empty}</p>}
        {(fields ?? []).map((field) => {
          const { parent, key } = splitPath(field.path);
          return (
            <div
              key={field.path}
              className="grid min-h-8 grid-cols-[minmax(0,1fr)_fit-content(60%)_auto] items-center gap-2.5 border-b border-line px-3 py-1.25 font-mono text-small last:border-b-0 max-sm:grid-cols-[minmax(0,1fr)_auto] short-screen:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-1 short-screen:gap-y-1"
            >
              <span className="truncate">
                <span className="text-fg-subtle">{parent}</span>
                <span className="text-syntax-function">{key}</span>
              </span>
              <span className="text-syntax-type [overflow-wrap:anywhere] max-sm:col-span-2 short-screen:col-span-2 max-sm:row-start-2 short-screen:row-start-2">
                {field.type}
              </span>
              <span
                className={cn(
                  "flex h-4.5 items-center rounded-chip px-1.5 font-sans text-meta",
                  field.required ? "bg-brand-dim text-brand" : "bg-raised text-fg-subtle",
                )}
              >
                {field.default !== undefined
                  ? `default ${JSON.stringify(field.default)}`
                  : field.required
                    ? "required"
                    : "optional"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
