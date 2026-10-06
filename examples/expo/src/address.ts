import { Platform } from "react-native";

/**
 * Where the example's mock is served. A React Native app has no page to
 * resolve a relative address against, so every address is absolute: the
 * iOS simulator reaches the computer at `localhost`, the Android emulator
 * at `10.0.2.2`, and a phone at the address `EXPO_PUBLIC_API_URL` names.
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:7020" : "http://localhost:7020");
