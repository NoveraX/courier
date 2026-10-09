import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeFile } from "../recipe-types";
import { DEMO_TEXT, EMAIL_FROM_NAME } from "./demo-parts";

/**
 * A screen that shows Courier at work in an Expo app: the users the API
 * answers with — from the mock until EXPO_PUBLIC_API_URL names a backend —
 * and a field and a button that create one. It brings its own React Query
 * client, and follows the system's light or dark appearance.
 *
 * @param ctx - The project, and what is set up in it
 * @param path - Where the screen goes, relative to the root
 * @param client - The `client.ts` module, relative to the root
 * @returns The screen
 * @example
 * ```ts
 * expoScreen(ctx, "src/app/courier.tsx", "src/courier/client.ts");
 * ```
 */
export function expoScreen(ctx: RecipeContext, path: string, client: string): RecipeFile {
  const content = `import { QueryClient, QueryClientProvider } from "@noverax/courier-react";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View } from "react-native";

import { q } from "${importSpecifier(path, client, ctx.extension)}";

/** Courier at work: your API's users, and a field that creates one. */
export default function CourierScreen() {
  const [client] = useState(() => new QueryClient());
  const ink = useColorScheme() === "dark" ? "#f4f4f5" : "#18181b";
  return (
    <QueryClientProvider client={client}>
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={[styles.title, { color: ink }]}>${DEMO_TEXT.title}</Text>
        <Text style={[styles.lead, { color: ink }]}>${DEMO_TEXT.lead}</Text>
        <Users ink={ink} />
      </ScrollView>
    </QueryClientProvider>
  );
}

function Users({ ink }: { ink: string }) {
  const users = q.users.useQuery("list");
  const create = q.users.useMutation("create", { onSuccess: () => users.refetch() });
  const [name, setName] = useState("");

  if (users.isPending) return <Text style={{ color: ink }}>${DEMO_TEXT.loading}</Text>;
  if (users.error) {
    return (
      <Text style={styles.alert}>
        Could not load users: {users.error.message}. Start the mock with ${ctx.manager.run("studio")}, or set
        EXPO_PUBLIC_API_URL to your backend.
      </Text>
    );
  }
  return (
    <View>
      {users.data.map((user) => (
        <View key={user.id} style={styles.row}>
          <Text style={{ color: ink }}>{user.name}</Text>
          <Text style={[styles.email, { color: ink }]}>{user.email}</Text>
        </View>
      ))}
      <View style={styles.form}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor="#71717a"
          style={[styles.input, { color: ink, borderColor: ink }]}
        />
        <Pressable
          accessibilityRole="button"
          disabled={create.isPending || name.trim() === ""}
          onPress={() => create.mutate({ name, email: ${EMAIL_FROM_NAME} }, { onSuccess: () => setName("") })}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>${DEMO_TEXT.add}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 24, paddingTop: 64, gap: 8 },
  title: { fontSize: 28, fontWeight: "700" },
  lead: { fontSize: 16, opacity: 0.75, marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#a1a1aa" },
  email: { fontSize: 14, opacity: 0.6 },
  form: { flexDirection: "row", gap: 8, marginTop: 16 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, opacity: 0.9 },
  button: { backgroundColor: "#2563eb", borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  pressed: { opacity: 0.8 },
  buttonText: { color: "#ffffff", fontWeight: "600" },
  alert: { color: "#dc2626" },
});
`;
  return { path, content, purpose: "a screen that shows Courier at work" };
}
