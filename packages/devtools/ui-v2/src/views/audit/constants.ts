import {
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
  XCircle,
} from "lucide-react";

import type { AuditCategory, AuditSeverity } from "./types";

interface SeverityConfig {
  icon: LucideIcon;
  color: string;
  bg: string;
  weight: number;
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
    weight: -15,
    label: "Errors",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-warning-foreground",
    bg: "bg-warning-muted",
    weight: -5,
    label: "Warnings",
  },
  hint: {
    icon: Info,
    color: "text-info-foreground",
    bg: "bg-info-muted",
    weight: -2,
    label: "Hints",
  },
  pass: {
    icon: CheckCircle2,
    color: "text-success-foreground",
    bg: "bg-success-muted",
    weight: 1,
    label: "Passes",
  },
};

import {
  Activity,
  Gauge,
  Lock,
  Sparkles,
} from "lucide-react";

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

export const MAX_SCORE = 100;

export const CATEGORY_ORDER: AuditCategory[] = [
  "performance",
  "reliability",
  "security",
  "best-practices",
];

export const P95_SLOW_MS = 1000;
export const P95_TIMEOUT_MS = 5000;
export const ERROR_RATE_HIGH = 0.2;
export const LARGE_RESPONSE_BYTES = 1_048_576;
export const MIDDLEWARE_OVERHEAD_WARN = 0.3;
