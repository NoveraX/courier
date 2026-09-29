import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EndpointNodeData } from "../../types";

// ── Props ────────────────────────────────────────────────────────────────────

interface SchemaTabProps {
  endpoint: EndpointNodeData;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SchemaTab({ endpoint }: SchemaTabProps): React.ReactElement {
  return (
    <div className="space-y-4">
      <SchemaSection
        title="Variables Schema"
        present={endpoint.hasVariablesSchema}
        description="Input validation schema for request variables"
      />
      <SchemaSection
        title="Response Schema"
        present={endpoint.hasResponseSchema}
        description="Output validation schema for response data"
      />

      {/* Validation badges */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border-subtle">
        <ValidationBadge label="Variables Validated" active={endpoint.hasVariablesSchema} />
        <ValidationBadge label="Response Validated" active={endpoint.hasResponseSchema} />
      </div>
    </div>
  );
}

// ── Schema Section ───────────────────────────────────────────────────────────

function SchemaSection({
  title,
  present,
  description,
}: {
  title: string;
  present: boolean;
  description: string;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-border-subtle bg-card/60 p-3">
      <div className="flex items-center gap-2">
        <span className="text-body-sm font-medium text-foreground">{title}</span>
        <Badge variant={present ? "emerald" : "secondary"} className="text-[10px]">
          {present ? "defined" : "none"}
        </Badge>
      </div>

      {present ? (
        <p className="mt-2 text-body-xs text-muted-foreground/70">
          {description} — validated at runtime using Standard Schema.
        </p>
      ) : (
        <p className="mt-2 text-body-xs text-muted-foreground/50 italic">
          No schema defined. Add a Standard Schema validator to enable runtime validation.
        </p>
      )}
    </div>
  );
}

// ── Validation Badge ─────────────────────────────────────────────────────────

function ValidationBadge({
  label,
  active,
}: {
  label: string;
  active: boolean;
}): React.ReactElement {
  const Icon = active ? Check : X;

  return (
    <span className="inline-flex items-center gap-1.5 text-body-xs text-muted-foreground/60">
      <Icon className={`size-3.5 ${active ? "text-emerald-400" : "text-zinc-500"}`} />
      {label}
    </span>
  );
}
