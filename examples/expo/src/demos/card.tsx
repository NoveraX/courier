import type { ReactNode } from "react";
import { StyleSheet, Text, useColorScheme, View } from "react-native";

/** How a demo is doing: waiting for its answer, answered, or failed. */
export type CardState = "waiting" | "ok" | "failed";

const MARK: Record<CardState, string> = { waiting: "…", ok: "✓", failed: "✕" };

/**
 * A demo of one thing Courier does, with whether it worked and what came back.
 *
 * @param props - The demo's title, its state, what it shows, and its controls
 * @returns The card
 */
export function Card(props: {
  title: string;
  state: CardState;
  detail: string;
  children?: ReactNode;
}): ReactNode {
  const dark = useColorScheme() === "dark";
  return (
    <View
      style={[styles.card, dark && styles.cardDark]}
      accessibilityLabel={`${props.title}: ${props.state}`}
    >
      <Text style={[styles.title, dark && styles.textDark]}>
        {MARK[props.state]} {props.title}
      </Text>
      <Text style={[styles.detail, dark && styles.mutedDark]} selectable>
        {props.detail}
      </Text>
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, padding: 14, borderRadius: 12, backgroundColor: "#f3f4f6" },
  cardDark: { backgroundColor: "#16181d" },
  title: { fontSize: 16, fontWeight: "600", color: "#0c0d0f" },
  textDark: { color: "#f5f6f7" },
  detail: { fontSize: 13, color: "#474c54", fontVariant: ["tabular-nums"] },
  mutedDark: { color: "#a3a9b2" },
});
