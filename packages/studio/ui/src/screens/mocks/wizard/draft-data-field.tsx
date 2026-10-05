import { FormField } from "@/design/form-field";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import { fixturesFileOf } from "@/features/mocks/wizard/fixtures-file-of";
import type { DataMode, MockDraft } from "@/features/mocks/wizard/types";

const MODES: readonly SegmentedOption<DataMode>[] = [
  { value: "generated", label: "Generated" },
  { value: "recorded", label: "Recorded" },
];

/**
 * Where a mock's answers come from: generated from the response schemas
 * and kept in its store, or recorded from the source's own server the first
 * time each call is made and replayed after — the same answers for every
 * demo and test.
 *
 * @param props - The draft, the source's server, and how to edit it
 * @returns The field
 * @example
 * ```tsx
 * <DraftDataField id="mock-draft-0" draft={draft} baseURL={url} onEdit={edit} />
 * ```
 */
export function DraftDataField({
  id,
  draft,
  baseURL,
  onEdit,
}: {
  id: string;
  draft: MockDraft;
  baseURL: string;
  onEdit: (patch: Partial<Pick<MockDraft, "data">>) => void;
}): React.ReactNode {
  const server = baseURL || "the source's own server";
  const hint =
    draft.data === "generated"
      ? "Records generated from the response schemas, kept in the mock's store."
      : `Each call goes to ${server} once; its answer is saved to ${fixturesFileOf(draft.key || "…")} and replayed after.`;
  return (
    <FormField id={`${id}-data`} label="Data" sub="where its answers come from" hint={hint}>
      <Segmented
        label="Data"
        quiet="subtle"
        options={MODES}
        value={draft.data}
        onChange={(data) => onEdit({ data })}
      />
    </FormField>
  );
}
