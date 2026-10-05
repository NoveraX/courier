import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Cable,
  CircleDot,
  CodeXml,
  Database,
  Eye,
  FileOutput,
  History,
  Palette,
  TriangleAlert,
} from "lucide-react";

import type { Settings } from "@/store/types-ui";

/** A section of Settings as its navigation lists it, and the settings it holds. */
export interface SectionEntry {
  id: string;
  label: string;
  icon: LucideIcon;
  /** A text colour class for its icon while it is the one in view. */
  tone: string;
  keys: readonly (keyof Settings)[];
}

/** The navigation's groups of sections, in page order. */
export const SECTION_GROUPS: readonly { label: string; sections: readonly SectionEntry[] }[] = [
  {
    label: "General",
    sections: [
      {
        id: "appearance",
        label: "Appearance",
        icon: Palette,
        tone: "text-syntax-keyword",
        keys: ["theme"],
      },
      {
        id: "connection",
        label: "Connection",
        icon: Cable,
        tone: "text-brand",
        keys: ["autoReconnect", "reconnectDelay"],
      },
    ],
  },
  {
    label: "Capture",
    sections: [
      {
        id: "recording",
        label: "Recording",
        icon: CircleDot,
        tone: "text-err",
        keys: ["maxRequests", "preserveLog", "ignorePatterns"],
      },
      {
        id: "display",
        label: "Display",
        icon: Eye,
        tone: "text-syntax-type",
        keys: ["timestampFormat", "jsonIndent"],
      },
      {
        id: "notifications",
        label: "Notifications",
        icon: Bell,
        tone: "text-warn",
        keys: ["toastOnError", "toastOnSlowRequest", "slowRequestThreshold", "toastOnFileChange"],
      },
    ],
  },
  {
    label: "Advanced",
    sections: [
      {
        id: "export",
        label: "Export",
        icon: FileOutput,
        tone: "text-fg-muted",
        keys: ["defaultExportFormat"],
      },
      {
        id: "apis",
        label: "API defaults",
        icon: CodeXml,
        tone: "text-brand",
        keys: [
          "apisValidation",
          "apisGroupBy",
          "apisClient",
          "apisGenerateTypes",
          "apisGenerateSchemas",
          "apisIncludeComments",
        ],
      },
      { id: "sessions", label: "Session history", icon: History, tone: "text-ok", keys: [] },
    ],
  },
  {
    label: "System",
    sections: [
      {
        id: "storage",
        label: "Storage",
        icon: Database,
        tone: "text-syntax-type",
        keys: ["storageWarnMb"],
      },
      { id: "danger", label: "Danger zone", icon: TriangleAlert, tone: "text-err", keys: [] },
    ],
  },
];
