/**
 * An import's file plan as Studio shows it: what happens to each file an
 * operation touches, decided by who owns the file, before anything is
 * written.
 */

/** Who a file belongs to, as far as the import can tell. */
export type FileOwnership =
  | "absent"
  | "recorded"
  | "recorded-edited"
  | "claimed"
  | "claimed-edited"
  | "foreign"
  | "link"
  | "not-a-file";

/** How a file the plan writes gets its content. `unchanged` ones are only recorded. */
export type PlannedWriteAction = "create" | "replace" | "merge" | "unchanged";

/** Why a file the operation touched is left as it is. */
export type KeptReason = "not-written-by-studio" | "link" | "not-a-file" | "unconfirmed";

/** A step only the user may allow: replacing or removing a file that is not Studio's untouched own. */
export interface PlanConfirmation {
  path: string;
  kind: "replace" | "remove";
  /** `edited`: it holds the user's edits; `claimed`: only its header says Studio wrote it; `foreign`: Studio did not write it for this import. */
  reason: "edited" | "claimed" | "foreign";
  /** Whether it is offered ticked. */
  preselected: boolean;
}

/** An import's file plan, as the UI is shown it. */
export interface FilePlanSummary {
  /** Quoted back to apply exactly this plan. */
  digest: string;
  /** The import's directory. */
  dir: string;
  writes: Array<{ path: string; action: PlannedWriteAction; was: FileOwnership }>;
  removals: Array<{ path: string; was: FileOwnership }>;
  kept: Array<{ path: string; reason: KeptReason }>;
  pending: PlanConfirmation[];
  /** Files Studio cannot write at all, being links or not files; a plan with any is not applied. */
  blocked: Array<{ path: string; reason: "link" | "not-a-file" }>;
  /** Files Studio recorded that are gone from disk. */
  forgotten: string[];
}

/** The plan the user was shown, with the steps they allowed. */
export interface PlanConsent {
  plan: FilePlanSummary;
  /** Paths of the pending steps the user allowed. */
  confirmed: string[];
}
