/**
 * The servers a package may run beside its page, as the upgrade tells
 * them from create-courier's list and Studio from courier-build's: one
 * list, so the two give a package the same side.
 */
import { FRAMEWORK_MARKERS } from "@noverax/courier-build/config";
import { SERVER_FRAMEWORKS } from "@noverax/create-courier/engine";
import { describe, expect, it } from "vitest";

const told = (list: ReadonlyArray<{ id: string; marker: string; runsWith?: boolean }>) =>
  list
    .map(({ id, marker, runsWith }) => `${id} ${marker}${runsWith === true ? " runs with" : ""}`)
    .sort();

describe("the servers beside a page", () => {
  it("are the ones Studio tells a package by", () => {
    expect(told(FRAMEWORK_MARKERS.filter((each) => each.server === true))).toEqual(
      told(SERVER_FRAMEWORKS),
    );
  });

  it("come before a page Vite builds in Studio's list, so a package that lists both is told by its server", () => {
    const at = (id: string) => FRAMEWORK_MARKERS.findIndex((each) => each.id === id);
    const servers = FRAMEWORK_MARKERS.flatMap((each) =>
      each.server === true ? [at(each.id)] : [],
    );

    expect(Math.max(...servers)).toBeLessThan(Math.min(at("react"), at("vue")));
  });
});
