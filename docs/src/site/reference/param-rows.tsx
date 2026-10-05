import { ListTree } from "lucide-react"
import { CodeBody } from "@/site/code/code-body"
import type { ReferenceField } from "@/site/content/reference"
import { InlineText } from "@/site/mdx/inline-text"
import type { ShownParam } from "./reference-data"

function FieldList({ fields }: { fields: readonly ReferenceField[] }) {
  return (
    <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
      {fields.map(({ name, desc }) => (
        <li key={name} className="text-control leading-[1.55]">
          <code className="text-label font-medium text-fg">{name}</code>
          <span className="text-fg-subtle"> — </span>
          <InlineText text={desc} />
        </li>
      ))}
    </ul>
  )
}

/**
 * The fields an export takes, as its page describes them: each by name,
 * with what it is for, the type the page writes out for it and the parts
 * of that type it lists.
 *
 * @param props - The fields
 * @returns The panel
 * @example
 * ```tsx
 * <ParamRows params={section.params} />
 * ```
 */
export function ParamRows({ params }: { params: readonly ShownParam[] }) {
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-panel">
      <div className="flex h-10 items-center gap-2 border-b border-line bg-bg-subtle px-3.5 font-mono text-micro tracking-[0.08em] text-fg-subtle">
        <ListTree aria-hidden="true" className="size-3.25" />
        PARAMETERS
        <span className="ml-auto tracking-normal">
          {params.length} {params.length === 1 ? "field" : "fields"}
        </span>
      </div>
      <dl className="m-0">
        {params.map(({ name, desc, code, fields }) => (
          <div
            key={name}
            className="grid gap-1.5 border-b border-line px-4 py-3.5 last:border-b-0 hover:bg-bg-subtle min-[860px]:grid-cols-[minmax(0,240px)_minmax(0,1fr)] min-[860px]:items-baseline min-[860px]:gap-4.5"
          >
            <dt>
              <code className="text-small font-medium text-fg">{name}</code>
            </dt>
            <dd className="m-0 min-w-0 text-[14px] leading-[1.55] text-fg-muted">
              {desc && (
                <p className="m-0 max-w-[62ch]">
                  <InlineText text={desc} />
                </p>
              )}
              {code && (
                <div className="mt-2.5 overflow-hidden rounded-control border border-line bg-bg-subtle first:mt-0 [&_pre]:px-3.5! [&_pre]:py-3! [&_pre]:text-label!">
                  <CodeBody html={code.html} />
                </div>
              )}
              {fields.length > 0 && <FieldList fields={fields} />}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
