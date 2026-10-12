import { FormField } from "@/design/form-field";
import { methodText } from "@/design/method-color";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import { TickBox } from "@/design/tick-box";
import type { AnswerableGroup } from "@/features/mocks/wizard/answerable-endpoints";
import type { AnswersMode, MockDraft } from "@/features/mocks/wizard/types";
import { cn } from "@/lib/utils";

const MODES: readonly SegmentedOption<AnswersMode>[] = [
  { value: "all", label: "Every endpoint" },
  { value: "some", label: "Some endpoints" },
];

interface DraftAnswersFieldProps {
  id: string;
  draft: MockDraft;
  /** The source's HTTP endpoints, by group. */
  groups: readonly AnswerableGroup[];
  /** Where the source's own server is, which the rest go to. */
  baseURL: string;
  error: string | undefined;
  onEdit: (patch: Partial<Pick<MockDraft, "answers" | "endpoints">>) => void;
}

/**
 * Which endpoints a mock answers: every one, or those ticked — the rest go
 * to the source's own server, as the app calls them, so a mock can stand in
 * for the few a backend does not have yet.
 *
 * @param props - The draft, the source's endpoints and server, and how to edit it
 * @returns The field
 * @example
 * ```tsx
 * <DraftAnswersField id="mock-draft-0" draft={draft} groups={groups} baseURL={url} error={undefined} onEdit={edit} />
 * ```
 */
export function DraftAnswersField(props: DraftAnswersFieldProps): React.ReactNode {
  const { id, draft, groups, baseURL, error, onEdit } = props;
  const toggle = (name: string): void =>
    onEdit({
      endpoints: draft.endpoints.includes(name)
        ? draft.endpoints.filter((picked) => picked !== name)
        : [...draft.endpoints, name],
    });
  const hint =
    draft.answers === "all"
      ? "The mock answers every endpoint of the source."
      : `The rest go to ${baseURL || "the source's own server"}, as your app calls them. Streams and channels the mock always answers.`;
  return (
    <FormField
      id={`${id}-answers`}
      label="Answers"
      sub="the endpoints the mock answers"
      hint={hint}
      error={error}
    >
      <div className="scroll-row max-w-full min-w-0">
        <Segmented
          label="Answers"
          quiet="subtle"
          options={MODES}
          value={draft.answers}
          onChange={(answers) => onEdit({ answers })}
        />
      </div>
      {draft.answers === "some" && (
        <fieldset
          aria-label="Endpoints the mock answers"
          className="m-0 flex max-h-48 w-full min-w-0 flex-col gap-2.5 overflow-auto rounded-card border border-line bg-inset px-2.5 py-2"
        >
          {groups.map((group) => (
            <div key={group.group || "outside any group"} className="flex flex-col gap-1">
              {group.group && (
                <span className="font-mono text-badge text-fg-subtle">{group.group}</span>
              )}
              {group.endpoints.map((endpoint) => (
                <label
                  key={endpoint.name}
                  className="flex cursor-pointer items-center gap-2 font-mono text-small pointer-coarse:min-h-10"
                >
                  <TickBox
                    checked={draft.endpoints.includes(endpoint.name)}
                    label={`Answer ${endpoint.name}`}
                    onChange={() => toggle(endpoint.name)}
                  />
                  <span
                    className={cn("w-11 text-meta font-semibold", methodText(endpoint.httpMethod))}
                  >
                    {endpoint.httpMethod}
                  </span>
                  <span>{endpoint.method}</span>
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      )}
    </FormField>
  );
}
