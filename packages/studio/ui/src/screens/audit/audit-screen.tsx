import { useNavigate, useSearch } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { useState } from "react";

import { useAuditReport } from "@/audit/use-audit-report";
import { categoryScores } from "@/features/audit/audit-score";
import type { AuditSearch } from "@/features/audit/audit-search";
import { categoryTally, matchesFinding, severityCounts } from "@/features/audit/finding-filter";
import { findingEndpoints } from "@/features/audit/finding-view";
import type { AuditCategory } from "@/features/audit/types";
import { useNow } from "@/hooks/use-tick";
import { useInspector } from "@/inspector/use-inspector";
import { useStudioStore } from "@/store";
import { AuditHeader } from "./audit-header";
import { FindingCard } from "./finding-card";
import { FindingsBar } from "./findings-bar";
import { ScoreHero } from "./score-hero";

function NoTraffic(): React.ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-dialog border border-line bg-panel px-6 py-16 text-center">
      <Shield aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="m-0 text-ui font-strong">No requests to audit</p>
      <p className="m-0 max-w-90 text-small text-fg-subtle">
        The audit reads this session's traffic — make a few calls from your app, then run it again.
      </p>
    </div>
  );
}

/**
 * The Audit page: the score of this session's traffic and what it is
 * called, a score a category, and every finding — filtered by severity,
 * category and search — with what it means, the fix and its code, and the
 * endpoints it names. The report holds still while it is read and runs
 * again on Re-run; it copies or downloads as Markdown.
 *
 * @returns The page
 * @example
 * ```tsx
 * <AuditScreen />
 * ```
 */
export function AuditScreen(): React.ReactNode {
  const { report, newSince, rerun } = useAuditReport();
  const search: AuditSearch = useSearch({ from: "/next/audit" });
  const navigate = useNavigate({ from: "/next/audit" });
  const { open } = useInspector();
  const requests = useStudioStore((s) => s.requests);
  const now = useNow();
  const { items } = report.result;
  /* Until a finding is opened or closed, the first one shows open — once the report has one. */
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const openId = chosen === undefined ? (items[0]?.id ?? null) : chosen;
  const update = (next: AuditSearch): void =>
    void navigate({ search: (prev) => ({ req: prev.req, tab: prev.tab, ...next }), replace: true });
  const choose = (cat: AuditCategory): void =>
    update({ ...search, cat: search.cat === cat ? undefined : cat });
  const byId = new Map(requests.map((r) => [r.id, r]));
  const shown = items.filter((item) => matchesFinding(item, search));
  const counts = severityCounts(items);
  const tallies = {
    performance: categoryTally(items, "performance"),
    reliability: categoryTally(items, "reliability"),
    security: categoryTally(items, "security"),
    "best-practices": categoryTally(items, "best-practices"),
  };
  return (
    <div className="mx-auto flex w-full max-w-320 flex-col gap-4.5 px-6 pt-6 pb-12">
      <AuditHeader report={report} newSince={newSince} now={now} onRerun={rerun} />
      {report.requests === 0 ? (
        <NoTraffic />
      ) : (
        <>
          <ScoreHero
            score={report.result.score}
            counts={counts}
            categories={categoryScores(items)}
            tallies={tallies}
            category={search.cat}
            onCategory={choose}
          />
          <FindingsBar search={search} counts={counts} onSearch={update} />
          <section aria-label="Findings" className="flex flex-col gap-2">
            {shown.map((item) => (
              <FindingCard
                key={item.id}
                item={item}
                endpoints={findingEndpoints(item, byId)}
                open={openId === item.id}
                onToggle={() => setChosen(openId === item.id ? null : item.id)}
                onOpenCall={open}
              />
            ))}
            {shown.length === 0 && (
              <p className="m-0 px-4 py-12 text-center text-ui text-fg-subtle">
                No findings match the current filters
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
