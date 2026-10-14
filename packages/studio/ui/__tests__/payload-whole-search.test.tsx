/**
 * @vitest-environment jsdom
 *
 * A search in an answer the inspector shows in part: it runs over the
 * whole answer, which the app keeps and Studio asks it for once; what it
 * finds in the parts left out shows in the tree and in the raw text, the
 * lines numbered as in the whole answer; and when the whole cannot be had,
 * the search covers the part shown and says why, and the next search
 * asks for the whole again.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PayloadView } from "@/features/requests/payload-view";
import { PayloadTab } from "@/inspector/tabs/payload-tab";
import type { WholeSource } from "@/inspector/tabs/use-whole-search";
import type { BodyAnswer } from "@/socket/ask-for-body";

afterEach(cleanup);

const NAMES = ["Kazan", "Samara", "Perm", "Kaluga", "Omsk"];
const WHOLE = {
  data: {
    cities: Array.from({ length: 5_000 }, (_, at) => ({
      id: at,
      name: `${NAMES[at % NAMES.length]}-${at}`,
    })),
  },
};
const TEXT = JSON.stringify(WHOLE);

/* The answer as Studio's event carries it: the first items, and the rest named where it was. */
const CUT: PayloadView = {
  value: {
    data: { cities: [...WHOLE.data.cities.slice(0, 3), "… 4,997 more items"] },
  },
  cutFrom: TEXT.length,
  chips: [],
  issues: new Map(),
};

let made = 0;

/* Each test's answer under a key of its own, as each request's is. */
function source(answer: BodyAnswer = { ok: true, data: TEXT }) {
  made += 1;
  return {
    key: `request:s1:r${made}:response`,
    load: vi.fn(() => Promise.resolve(answer)),
  } satisfies WholeSource;
}

function search(text: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: "Find in the answer" }), {
    target: { value: text },
  });
}

describe("a search in an answer shown in part", () => {
  it("finds what the part left out, in the whole answer, asked for once", async () => {
    const whole = source();
    const { container } = render(
      <PayloadTab
        view={CUT}
        mode="tree"
        onMode={vi.fn()}
        whole={whole}
        searchLabel="Find in the answer"
      />,
    );

    search("omsk-4999");

    expect(await screen.findByText(/^Searched the whole body, .+\.$/)).toBeTruthy();
    expect(container.querySelector('[aria-current="true"]')?.getAttribute("data-path")).toBe(
      "data.cities.4999.name",
    );
    expect(container.querySelector("mark")?.textContent).toBe("Omsk-4999");
    expect(screen.getByText("1 / 1")).toBeTruthy();

    search("perm-4997");
    expect(await screen.findByText("Perm-4997", { selector: "mark" })).toBeTruthy();
    expect(whole.load).toHaveBeenCalledTimes(1);
  });

  it("says how many it found and how many show, when they are more than show", async () => {
    render(
      <PayloadTab
        view={CUT}
        mode="tree"
        onMode={vi.fn()}
        whole={source()}
        searchLabel="Find in the answer"
      />,
    );

    search("-");

    expect(
      await screen.findByText(
        /^5,000 matches in the whole body, .+: the first 1,000 show\.$/,
        undefined,
        {
          timeout: 5_000,
        },
      ),
    ).toBeTruthy();
  });

  it("says so when what it found runs past the rows it shows", async () => {
    render(
      <PayloadTab
        view={CUT}
        mode="tree"
        onMode={vi.fn()}
        whole={source()}
        searchLabel="Find in the answer"
      />,
    );

    search("cities");

    expect(
      await screen.findByText(
        /^Searched the whole body, .+: the first 4,000 rows of what it found show\.$/,
      ),
    ).toBeTruthy();
  });

  it("shows the raw lines that hold it, numbered as in the whole answer", async () => {
    const { container } = render(
      <PayloadTab
        view={CUT}
        mode="raw"
        onMode={vi.fn()}
        whole={source()}
        searchLabel="Find in the answer"
      />,
    );
    const lines = JSON.stringify(WHOLE, null, 2).split("\n");
    const number = lines.findIndex((line) => line.includes('"Omsk-4999"')) + 1;

    search("omsk-4999");

    await screen.findByText(/^Searched the whole body/);
    const current = container.querySelector('[aria-current="true"]');
    expect(current?.getAttribute("data-line")).toBe(String(number));
    expect(current?.textContent).toContain(`${number}`);
    expect(current?.textContent).toContain('"Omsk-4999"');
  });

  it("searches the part shown, and says why, when the app no longer keeps the whole", async () => {
    const whole = source({ ok: false, error: "The app no longer keeps this body." });
    const { container } = render(
      <PayloadTab
        view={CUT}
        mode="tree"
        onMode={vi.fn()}
        whole={whole}
        searchLabel="Find in the answer"
      />,
    );

    search("kazan");

    expect(
      await screen.findByText(
        "The whole body could not be searched, so the search covers the part shown. The app no longer keeps this body.",
      ),
    ).toBeTruthy();
    expect(container.querySelector('[aria-current="true"]')?.getAttribute("data-path")).toBe(
      "data.cities.0.name",
    );
  });

  it("asks for the whole again once it could not be had", async () => {
    const whole = source();
    whole.load.mockResolvedValueOnce({ ok: false, error: "Studio did not answer." });
    render(
      <PayloadTab
        view={CUT}
        mode="tree"
        onMode={vi.fn()}
        whole={whole}
        searchLabel="Find in the answer"
      />,
    );
    search("omsk-4999");
    await screen.findByText(/could not be searched.+Studio did not answer\.$/);

    search("kaluga-4998");

    expect(await screen.findByText(/^Searched the whole body, .+\.$/)).toBeTruthy();
    expect(screen.getByText("Kaluga-4998", { selector: "mark" })).toBeTruthy();
    expect(whole.load).toHaveBeenCalledTimes(2);
  });

  it("goes back to the part shown once the search is cleared", async () => {
    render(
      <PayloadTab
        view={CUT}
        mode="tree"
        onMode={vi.fn()}
        whole={source()}
        searchLabel="Find in the answer"
      />,
    );
    search("omsk-4999");
    await screen.findByText(/^Searched the whole body/);

    search("");

    expect(screen.queryByText(/whole body, .+\./)).toBeNull();
    expect(screen.getByText('"… 4,997 more items"')).toBeTruthy();
  });

  it("asks for another answer's whole when the inspector moves to it, and shows none of the last one's", async () => {
    const first = source();
    const other = {
      data: {
        cities: [
          { id: 0, name: "Tver-0" },
          { id: 1, name: "Omsk-4999" },
        ],
      },
    };
    const second = source({ ok: true, data: JSON.stringify(other) });
    const { container, rerender } = render(
      <PayloadTab
        view={CUT}
        mode="tree"
        onMode={vi.fn()}
        whole={first}
        searchLabel="Find in the answer"
      />,
    );
    search("omsk-4999");
    await screen.findByText(/^Searched the whole body/);

    rerender(
      <PayloadTab
        view={{ ...CUT }}
        mode="tree"
        onMode={vi.fn()}
        whole={second}
        searchLabel="Find in the answer"
      />,
    );

    expect(container.querySelector('[data-path="data.cities.4999.name"]')).toBeNull();
    await screen.findByText(/^Searched the whole body/);
    expect(second.load).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[aria-current="true"]')?.getAttribute("data-path")).toBe(
      "data.cities.1.name",
    );
  });

  it("asks for nothing when the answer shows whole", () => {
    const whole = source();
    render(
      <PayloadTab
        view={{ ...CUT, cutFrom: undefined }}
        mode="tree"
        onMode={vi.fn()}
        whole={whole}
        searchLabel="Find in the answer"
      />,
    );

    search("kazan");

    expect(whole.load).not.toHaveBeenCalled();
    expect(screen.getByText("1 / 1")).toBeTruthy();
  });
});
