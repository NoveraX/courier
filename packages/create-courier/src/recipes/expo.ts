import { isRecord } from "../is-record";
import { expoTabEdits } from "./edits/expo-tabs";
import { importSpecifier } from "./import-specifier";
import type { Recipe, RecipeContext, RecipeFile } from "./recipe-types";
import { builtSource, courierConfig, courierMocks } from "./shared/courier-config";
import { exampleApi } from "./shared/example-api";
import { expoScreen } from "./shared/expo-screen";
import { studioStep } from "./shared/next-steps";
import { courierPackages } from "./shared/packages";
import { studioScripts } from "./shared/recipe-parts";
import { addsExample } from "./shared/wired";

/* The app's own folder, `src/` in Expo's template, and the router's pages in it. */
function layoutOf(ctx: RecipeContext): { dir: string; pages: string } {
  if (ctx.project.exists("src/app")) return { dir: "src/courier", pages: "src/app" };
  return { dir: "courier", pages: "app" };
}

function address(ctx: RecipeContext, dir: string): RecipeFile {
  const mock = ctx.ports.mock;
  const content = `import { Platform } from "react-native";

/**
 * Where the app reaches your API: EXPO_PUBLIC_API_URL where it names a
 * backend, else the mock Courier Studio runs on this computer — at
 * localhost from the iOS simulator and the web, at 10.0.2.2 from the
 * Android emulator. A phone reaches this computer at its address on the
 * network: name it in EXPO_PUBLIC_API_URL.
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:${mock}" : "http://localhost:${mock}");
`;
  return { path: `${dir}/address.ts`, content, purpose: "where the app reaches your API" };
}

function client(ctx: RecipeContext, dir: string): RecipeFile {
  const path = `${dir}/client.ts`;
  const from = (file: string) => importSpecifier(path, `${dir}/${file}`, ctx.extension);
  const content = `import { createQueryCaller } from "@noverax/courier-react";

import { API_URL } from "${from("address.ts")}";
import { createApi } from "${from("api.ts")}";

/** Your API, at the address the app reaches it at. */
export const api = createApi(API_URL);

/** React Query hooks for your API, which the app calls directly. */
export const q = createQueryCaller(api);
`;
  return { path, content, purpose: "React Query hooks for your API" };
}

/* The URL scheme app.json gives the app, which opens a screen by its path. */
function schemeOf(ctx: RecipeContext): string | undefined {
  const text = ctx.project.read("app.json");
  if (text === undefined) return undefined;
  const parsed: unknown = JSON.parse(text);
  const expo = isRecord(parsed) && isRecord(parsed.expo) ? parsed.expo : undefined;
  return typeof expo?.scheme === "string" ? expo.scheme : undefined;
}

/**
 * Courier in an Expo app: its API, which the app calls directly at an
 * address that suits the simulator, the emulator and a phone, React Query
 * hooks for it, a screen that shows it at work, and the mock Studio runs.
 *
 * @param ctx - The project, and what is set up in it
 * @returns What setting Courier up takes
 * @example
 * ```ts
 * expoRecipe(ctx).files.map((file) => file.path);
 * ```
 */
export function expoRecipe(ctx: RecipeContext): Recipe {
  const { dir, pages } = layoutOf(ctx);
  const example = addsExample(ctx);
  const api = `${dir}/api.ts`;
  const scheme = schemeOf(ctx);
  /* Expo's template lays its root out as tabs, listed by name: a screen out of the list is never shown. */
  const tabs = ["src/components/app-tabs.tsx", "src/components/app-tabs.web.tsx"];
  const tabbed = example && tabs.every((path) => ctx.project.exists(path));
  const reach = { baseUrl: "", variable: "EXPO_PUBLIC_API_URL", proxied: false, factory: true };
  return {
    files: [
      ...(example ? exampleApi(ctx, dir, reach) : []),
      courierConfig(ctx, api, builtSource(ctx)),
      ...(example && ctx.choices.mocks ? [courierMocks(ctx, api, builtSource(ctx))] : []),
      ...(example
        ? [
            address(ctx, dir),
            client(ctx, dir),
            expoScreen(ctx, `${pages}/courier.tsx`, `${dir}/client.ts`),
          ]
        : []),
    ],
    edits: tabbed ? expoTabEdits(tabs[0] ?? "", tabs[1] ?? "") : [],
    ...courierPackages(ctx, { react: true, runtime: false }),
    scripts: studioScripts(ctx),
    manual: [],
    next: [
      ...studioStep(ctx),
      {
        command: ctx.manager.run("web"),
        what: tabbed
          ? "starts the app in the browser: open its Courier tab"
          : "starts the app in the browser: open /courier",
      },
      ...(tabbed
        ? [
            {
              command: ctx.manager.run("ios"),
              what: "starts it in the iOS simulator, with the same tab",
            },
          ]
        : scheme
          ? [{ command: "", what: `In the simulator or on a phone, open ${scheme}://courier` }]
          : []),
    ],
  };
}
