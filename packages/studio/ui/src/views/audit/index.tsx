import { ClipboardCopy, Download, Share2, Shield } from "lucide-react";
import { toast } from "sonner";
import { exportAsMarkdown } from "@/features/audit/export-report";
import { copyToClipboard } from "@/lib/clipboard";
import { downloadFile } from "@/lib/export";
import { EmptyState } from "../../components/shared/empty-state";
import { PageShell } from "../../components/shared/page-shell";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useStudioStore } from "../../store";
import { AuditFilterBar } from "./audit-filter-bar";
import { AuditList } from "./audit-list";
import { CategorySummary } from "./category-summary";
import { ScoreGauge } from "./score-gauge";
import { useAudit } from "./use-audit";

export function AuditView(): React.ReactNode {
  const requestCount = useStudioStore((s) => s.requests.length);

  if (requestCount === 0) {
    return (
      <PageShell center>
        <EmptyState
          icon={Shield}
          heading="No requests to audit"
          description="Make some API calls first to see the audit results."
        />
      </PageShell>
    );
  }

  return <AuditContent />;
}

function AuditContent(): React.ReactNode {
  const audit = useAudit();
  const md = exportAsMarkdown(audit.result);

  const handleCopy = (): void => {
    copyToClipboard(md, "report");
  };

  const handleDownload = (): void => {
    downloadFile(md, `courier-audit-${Date.now()}.md`, "text/markdown");
    toast.success("Report downloaded");
  };

  return (
    <PageShell>
      <div className="space-y-5 p-5">
        <div className="flex items-start gap-8">
          <ScoreGauge result={audit.result} />
          <div className="flex-1 space-y-4">
            <CategorySummary items={audit.result.items} onCategoryClick={audit.setCategoryFilter} />
            <AuditFilterBar
              result={audit.result}
              severityFilter={audit.severityFilter}
              categoryFilter={audit.categoryFilter}
              onSeverityChange={audit.setSeverityFilter}
              onCategoryChange={audit.setCategoryFilter}
              totalFiltered={audit.filteredItems.length}
            >
              <ExportMenu onCopy={handleCopy} onDownload={handleDownload} />
            </AuditFilterBar>
          </div>
        </div>

        <AuditList items={audit.filteredItems} />
      </div>
    </PageShell>
  );
}

function ExportMenu({
  onCopy,
  onDownload,
}: {
  onCopy: () => void;
  onDownload: () => void;
}): React.ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 h-7 px-2 border-border-subtle text-muted-foreground text-[11px] font-normal"
        >
          <Share2 className="size-3" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onCopy} className="gap-2 text-xs">
          <ClipboardCopy className="size-3.5" />
          Copy as Markdown
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDownload} className="gap-2 text-xs">
          <Download className="size-3.5" />
          Download .md file
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
