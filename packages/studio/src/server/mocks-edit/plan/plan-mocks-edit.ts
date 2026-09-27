import { MocksEditRefusal } from "../mocks-edit-refusal";
import { auditInsertedCode } from "./audit-inserted-code";
import { draftMocksEdit } from "./draft-mocks-edit";
import { guardKeys } from "./guard-keys";
import { isPureInsertion } from "./is-pure-insertion";
import type { EditableFile } from "./read-editable";
import { readEditable } from "./read-editable";
import { rejectPlan } from "./reject-plan";
import type { MocksPlan, PlanInput } from "./types";

/**
 * Plan the edit that declares mocks in `courier.mocks.ts`: text in, the new
 * file text and the insertions that produce it out. No filesystem, network
 * or module evaluation is involved.
 *
 * An existing file only ever gains text — entries appended to the object it
 * exports, or a default export appended at its end, and the imports those
 * need — and the plan is read back and audited before it is returned. A
 * missing file is planned as the same insertions into an empty one, written
 * in the config's style.
 *
 * @param input - The files to plan against and the mocks to declare
 * @returns The file as written, the insertions, the keys the object declared,
 *   whether it is created, and the specifier it imports the config with
 * @throws {MocksEditRefusal} When Studio should leave the edit to the user; the code says why.
 *   `INTERNAL_PLAN_REJECTED` for a mocks file whose text the caller did not read
 *
 * @example
 * ```ts
 * const plan = planMocksEdit({
 *   existing: null,
 *   createName: "courier.mocks.ts",
 *   configName: "courier.config.ts",
 *   configText: null,
 *   explicitExtensions: false,
 *   requests: [{ key: "api", source: "api", port: null, seedCount: 20, autoStart: true }],
 * });
 * plan.creates; // → true
 * plan.edits; // → [{ start: 0, end: 0, text: plan.text }]
 * plan.configSpecifier; // → "./courier.config"
 * ```
 */
export function planMocksEdit(input: PlanInput): MocksPlan {
  const file = readTarget(input);
  guardKeys(file.literalKeys, input.requests, file.parsed.fileName);
  const draft = draftMocksEdit(file, input);
  if (!isPureInsertion(draft.audit.oldText, draft.text, draft.edits)) {
    rejectPlan(draft.audit, "its edits are not pure insertions that produce the planned text");
  }
  auditInsertedCode(draft.text, draft.audit);
  return {
    text: draft.text,
    edits: draft.edits,
    literalKeys: draft.literalKeys,
    creates: input.existing === null,
    configSpecifier: draft.configSpecifier,
  };
}

function readTarget({ existing, createName }: PlanInput): EditableFile {
  if (existing === null) return readEditable(createName, "");
  if (existing.text !== null) return readEditable(existing.name, existing.text);
  throw new MocksEditRefusal(
    "INTERNAL_PLAN_REJECTED",
    `Studio was asked to plan an edit of ${existing.name} without having read it.`,
  );
}
