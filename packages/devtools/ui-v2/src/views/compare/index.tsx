import { ArrowLeftRight, GitCompare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageShell } from "@/components/shared/page-shell";
import {
  SegmentedControl,
  type SegmentOption,
} from "@/components/shared/segmented-control";

import type { CompareTab } from "./types";
import { useCompare } from "./use-compare";
import { RequestPicker } from "./request-picker";
import { DiffViewer } from "./diff-viewer";
import { HeadersDiffView } from "./headers-diff";
import { TimingDiffView } from "./timing-diff";

// ── Tab config ──────────────────────────────────────────────────────────────

const TAB_OPTIONS: SegmentOption<CompareTab>[] = [
  { value: "payload", label: "Payload" },
  { value: "response", label: "Response" },
  { value: "headers", label: "Headers" },
  { value: "timing", label: "Timing" },
];

// ── View ────────────────────────────────────────────────────────────────────

export function CompareView(): React.ReactNode {
  const compare = useCompare();

  if (compare.requests.length === 0) {
    return (
      <PageShell center>
        <EmptyState
          icon={GitCompare}
          heading="No requests to compare"
          description="Make some API calls first to compare requests side by side."
        />
      </PageShell>
    );
  }

  return (
    <PageShell noScroll toolbar={<CompareToolbar compare={compare} />}>
      <CompareContent compare={compare} />
    </PageShell>
  );
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

function CompareToolbar({
  compare,
}: {
  compare: ReturnType<typeof useCompare>;
}): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2">
      <div className="min-w-0 flex-1">
        <RequestPicker
          requests={compare.requests}
          selectedId={compare.leftReq?.id}
          onSelect={compare.setLeft}
          label="Select left request..."
          excludeId={compare.rightReq?.id}
        />
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={compare.swap}
        disabled={!compare.leftReq || !compare.rightReq}
        aria-label="Swap sides"
      >
        <ArrowLeftRight className="size-3.5" />
      </Button>

      <div className="min-w-0 flex-1">
        <RequestPicker
          requests={compare.requests}
          selectedId={compare.rightReq?.id}
          onSelect={compare.setRight}
          label="Select right request..."
          excludeId={compare.leftReq?.id}
        />
      </div>

      <div className="ml-2 shrink-0">
        <SegmentedControl
          options={TAB_OPTIONS}
          value={compare.tab}
          onChange={compare.setTab}
        />
      </div>
    </div>
  );
}

// ── Content ─────────────────────────────────────────────────────────────────

function CompareContent({
  compare,
}: {
  compare: ReturnType<typeof useCompare>;
}): React.ReactElement {
  if (!compare.leftReq || !compare.rightReq) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={GitCompare}
          heading="Select two requests"
          description={
            !compare.leftReq && !compare.rightReq
              ? "Choose a request on each side to start comparing."
              : "Choose one more request to see the diff."
          }
        />
      </div>
    );
  }

  switch (compare.tab) {
    case "payload":
      return (
        <DiffViewer
          lines={compare.payloadDiff ?? []}
          leftLabel="Left Payload"
          rightLabel="Right Payload"
        />
      );
    case "response":
      return (
        <DiffViewer
          lines={compare.responseDiff ?? []}
          leftLabel="Left Response"
          rightLabel="Right Response"
        />
      );
    case "headers":
      return <HeadersDiffView headers={compare.headersDiff ?? []} />;
    case "timing":
      return <TimingDiffView comparisons={compare.timingDiff ?? []} />;
  }
}
