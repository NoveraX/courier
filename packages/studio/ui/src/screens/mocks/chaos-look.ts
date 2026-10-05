import type { LucideIcon } from "lucide-react";
import {
  CloudDrizzle,
  CloudLightning,
  CloudOff,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import type { ChaosMode } from "@/features/mocks/chaos-config";

/** How a chaos mode is drawn: its name, what it does, its icon, and its colour as a text colour that its parts read as `currentColor`. */
export interface ChaosLook {
  label: string;
  sub: string;
  icon: LucideIcon;
  tone: string;
}

/** Each chaos mode's look, shared by the network condition and the mode cards. */
export const CHAOS_LOOK: Readonly<Record<ChaosMode, ChaosLook>> = {
  stable: {
    label: "Stable",
    sub: "Real handlers, no injected faults",
    icon: ShieldCheck,
    tone: "text-ok",
  },
  degraded: {
    label: "Degraded",
    sub: "Occasional 500s and timeouts",
    icon: CloudDrizzle,
    tone: "text-warn",
  },
  unstable: {
    label: "Unstable",
    sub: "Frequent mixed failures",
    icon: CloudLightning,
    tone: "text-[color-mix(in_srgb,var(--color-err)_60%,var(--color-warn))]",
  },
  down: { label: "Down", sub: "Every request returns 503", icon: CloudOff, tone: "text-err" },
  custom: {
    label: "Custom",
    sub: "Your own rate and mix",
    icon: SlidersHorizontal,
    tone: "text-brand",
  },
};
