import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  CircleCheck,
  CircleX,
  Gauge,
  LifeBuoy,
  Lightbulb,
  Shield,
  TriangleAlert,
} from "lucide-react";

import type { AuditCategory, AuditSeverity } from "@/features/audit/types";

/** How a severity is named and coloured. */
export interface SeverityLook {
  label: string;
  icon: LucideIcon;
  /** Text in its colour. */
  text: string;
  /** A tinted ground in its colour. */
  dim: string;
  /** A solid mark in its colour. */
  fill: string;
  /** An open finding's edge in its colour. */
  edge: string;
}

/** Each severity's name, icon and colours. */
export const SEVERITY_LOOK: Readonly<Record<AuditSeverity, SeverityLook>> = {
  error: {
    label: "Errors",
    icon: CircleX,
    text: "text-err",
    dim: "bg-err-dim",
    fill: "bg-err",
    edge: "border-err/35",
  },
  warning: {
    label: "Warnings",
    icon: TriangleAlert,
    text: "text-warn",
    dim: "bg-warn-dim",
    fill: "bg-warn",
    edge: "border-warn/35",
  },
  hint: {
    label: "Hints",
    icon: Lightbulb,
    text: "text-brand",
    dim: "bg-brand-dim",
    fill: "bg-brand",
    edge: "border-brand/35",
  },
  pass: {
    label: "Passed",
    icon: CircleCheck,
    text: "text-ok",
    dim: "bg-ok-dim",
    fill: "bg-ok",
    edge: "border-ok/35",
  },
};

/** Each category's name, icon and colour, as the page shows them. */
export const CATEGORY_LOOK: Readonly<
  Record<AuditCategory, { label: string; icon: LucideIcon; text: string }>
> = {
  performance: { label: "Performance", icon: Gauge, text: "text-brand" },
  reliability: { label: "Reliability", icon: LifeBuoy, text: "text-warn" },
  security: { label: "Security", icon: Shield, text: "text-ok" },
  "best-practices": { label: "Practices", icon: BadgeCheck, text: "text-syntax-keyword" },
};
