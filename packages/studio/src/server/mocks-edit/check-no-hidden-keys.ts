import type { LoadedCourierConfig } from "../config-loader";
import { MocksEditRefusal } from "./mocks-edit-refusal";
import type { MocksPlan } from "./plan/types";

/**
 * Check that every mock the file declares is written in the object the edit
 * adds to. A key added to that object after it was built would be dropped
 * or duplicated by an edit of the literal.
 *
 * @param loaded - What Studio runs
 * @param plan - The planned edit, with the keys its object literal shows
 * @throws MocksEditRefusal MOCKS_KEYS_HIDDEN
 */
export function checkNoHiddenKeys(loaded: LoadedCourierConfig, plan: MocksPlan): void {
  if (plan.creates) return;
  const hidden = Object.keys(loaded.mocks.entries).filter((key) => !plan.literalKeys.includes(key));
  if (hidden.length === 0) return;
  throw new MocksEditRefusal(
    "MOCKS_KEYS_HIDDEN",
    `The mocks file declares ${hidden.join(", ")} outside the object Studio would add to, so Studio cannot tell where a new mock belongs.`,
  );
}
