/**
 * Constants and icon maps used by RegistryCard.
 */

import { FileText, FileUp, Globe } from "lucide-react";
import type { ComponentType } from "react";

interface StatusConfigEntry {
  label: string;
  variant: "emerald" | "amber" | "rose" | "secondary";
}

export const STATUS_CONFIG: Record<string, StatusConfigEntry> = {
  "up-to-date": { label: "Up to date", variant: "emerald" },
  "updates-available": { label: "Update available", variant: "amber" },
  checking: { label: "Checking…", variant: "secondary" },
  error: { label: "Check failed", variant: "rose" },
  unchecked: { label: "Not checked", variant: "secondary" },
};

export const IMPORT_ICON: Record<string, ComponentType<{ className?: string }>> = {
  url: Globe,
  file: FileUp,
  raw: FileText,
};
