/**
 * @vitest-environment jsdom
 */
/**
 * The Explorer shows the sources `courier.config.ts` declares, as the
 * import wizard promises once an import is declared: before any request is
 * made, with each group's prefix, and with what traffic adds beside them.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useStudioStore } from "@/store";
import { type ExplorerData, useExplorerData } from "../src/views/explorer/use-explorer-data";
import { API, trafficRequest } from "./playground-fixtures";

let data: ExplorerData;

function Harness(): null {
  data = useExplorerData();
  return null;
}

beforeEach(() => {
  useStudioStore.setState({ scanSources: [API], requests: [] });
});

afterEach(() => cleanup());

describe("the Explorer's sources", () => {
  it("lists a declared source before any request is made", () => {
    render(<Harness />);

    expect(data.isEmpty).toBe(false);
    expect(data.sources.map((source) => [source.name, source.endpointCount])).toEqual([["api", 6]]);
    expect(data.groups.find((group) => group.name === "misc")?.prefix).toBe("v2/misc");
  });

  it("keeps a source seen only in traffic beside the declared ones", () => {
    useStudioStore.setState({ requests: [trafficRequest()] });
    render(<Harness />);

    expect(data.sources.map((source) => source.name)).toEqual(["api", "localhost"]);
  });
});
