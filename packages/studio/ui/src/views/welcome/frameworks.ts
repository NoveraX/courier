/**
 * Public entry point for framework setup walkthroughs.
 *
 * Re-exports the type definitions and the assembled FRAMEWORKS list. The
 * per-framework data lives in `./framework-configs/*`.
 */

import { NEXTJS } from "./framework-configs/nextjs";
import { NUXT } from "./framework-configs/nuxt";
import { REACT, VUE } from "./framework-configs/react-vue";
import { REMIX, SVELTEKIT } from "./framework-configs/sveltekit-remix";
import { ANGULAR, ASTRO, SOLID } from "./framework-configs/astro-angular-solid";

import type { FrameworkConfig } from "./frameworks-types";

export type { CodeVariant, FrameworkConfig, SetupStep } from "./frameworks-types";

export const FRAMEWORKS: FrameworkConfig[] = [
  NEXTJS,
  NUXT,
  REACT,
  VUE,
  SVELTEKIT,
  REMIX,
  ASTRO,
  ANGULAR,
  SOLID,
];

export const WELCOME_STORAGE_KEY = "nexus-studio-v2:welcome-completed";
