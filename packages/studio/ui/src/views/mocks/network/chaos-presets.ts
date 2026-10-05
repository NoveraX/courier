/**
 * The chaos presets the classic network controls list, with their icons;
 * their rates and mixes live in features/mocks/chaos-config.
 */

import { Flame, SlidersHorizontal } from "lucide-react";

export const CHAOS_PRESETS = [
  { value: "stable" as const, label: "Stable" },
  { value: "degraded" as const, label: "Degraded" },
  { value: "unstable" as const, label: "Unstable" },
  { value: "down" as const, label: "Down", icon: Flame },
  { value: "custom" as const, label: "Custom", icon: SlidersHorizontal },
];
