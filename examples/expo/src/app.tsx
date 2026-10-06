import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, useColorScheme } from "react-native";

import { API_URL } from "./address";
import { queryClient } from "./client";
import { CancelDemo } from "./demos/cancel-demo";
import { LiveDemo } from "./demos/live-demo";
import { UploadDemo } from "./demos/upload-demo";
import { UsersDemo } from "./demos/users-demo";

/* The engine the app runs on, shown beside the address: Hermes, unless the app opted out. */
const ENGINE = "HermesInternal" in globalThis ? "Hermes" : "JavaScriptCore";

/** The example: each thing Courier does in a React Native app, against the example's server. */
export function App(): ReactNode {
  const dark = useColorScheme() === "dark";
  return (
    <QueryClientProvider client={queryClient}>
      <ScrollView
        style={{ backgroundColor: dark ? "#08090a" : "#fbfbfa" }}
        contentContainerStyle={styles.page}
      >
        <Text style={[styles.title, dark && styles.light]}>Courier on Expo</Text>
        <Text style={styles.address}>
          {API_URL} · {ENGINE}
        </Text>
        <UsersDemo />
        <UploadDemo />
        <LiveDemo />
        <CancelDemo />
      </ScrollView>
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12, paddingHorizontal: 16, paddingTop: 72, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: "700", color: "#0c0d0f" },
  light: { color: "#f5f6f7" },
  address: { fontSize: 13, color: "#646a73", fontFamily: "Menlo" },
});
