import { AlertTriangle, CheckCircle2, Info, type LucideIcon, XCircle } from "lucide-react";

import type { AuditCategory, AuditSeverity } from "@/features/audit/types";

interface SeverityConfig {
  icon: LucideIcon;
  color: string;
  bg: string;
  label: string;
}

interface CategoryConfig {
  icon: LucideIcon;
  label: string;
  description: string;
}

export const SEVERITY_CONFIG: Record<AuditSeverity, SeverityConfig> = {
  error: {
    icon: XCircle,
    color: "text-destructive-foreground",
    bg: "bg-destructive-muted",
    label: "Errors",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-warning-foreground",
    bg: "bg-warning-muted",
    label: "Warnings",
  },
  hint: {
    icon: Info,
    color: "text-info-foreground",
    bg: "bg-info-muted",
    label: "Hints",
  },
  pass: {
    icon: CheckCircle2,
    color: "text-success-foreground",
    bg: "bg-success-muted",
    label: "Passes",
  },
};

import { Activity, Gauge, Lock, Sparkles } from "lucide-react";

export const CATEGORY_CONFIG: Record<AuditCategory, CategoryConfig> = {
  performance: {
    icon: Gauge,
    label: "Performance",
    description: "Response times, payload sizes, and caching",
  },
  reliability: {
    icon: Activity,
    label: "Reliability",
    description: "Error rates, timeouts, and failure patterns",
  },
  security: {
    icon: Lock,
    label: "Security",
    description: "Validation, authentication, and data safety",
  },
  "best-practices": {
    icon: Sparkles,
    label: "Best Practices",
    description: "Schema usage, naming, and API design",
  },
};

export const SCORE_THRESHOLDS = [
  { min: 90, label: "Excellent", color: "text-success-foreground", stroke: "stroke-success" },
  { min: 70, label: "Good", color: "text-warning-foreground", stroke: "stroke-warning" },
  { min: 0, label: "Poor", color: "text-destructive-foreground", stroke: "stroke-destructive" },
] as const;
