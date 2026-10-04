/**
 * The shape of a framework setup walkthrough, which each per-framework data
 * module names without the whole FRAMEWORKS list.
 */

import type { LucideIcon } from "lucide-react";

export interface CodeVariant {
  label: string;
  filePath: string;
  code: string;
  lang?: string;
}

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  actionLabel: string;
  filePath?: string;
  code?: string;
  lang?: string;
  /** Multiple code variants with tab switcher (e.g. Turbopack vs Webpack) */
  variants?: CodeVariant[];
  autoComplete?: boolean;
}

export interface FrameworkConfig {
  id: string;
  name: string;
  description: string;
  steps: SetupStep[];
}
