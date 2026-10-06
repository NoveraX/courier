import { type ReactNode, useRef, useState } from "react";
import { Button, View } from "react-native";

import { client } from "../client";
import { Card, type CardState } from "./card";
import { messageOf } from "./state-of";

/** A call the server answers slowly, cancelled before it does. */
export function CancelDemo(): ReactNode {
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<CardState>("waiting");
  const [detail, setDetail] = useState("Not started");
  const start = async () => {
    controller.current = new AbortController();
    setState("waiting");
    setDetail("Waiting for the answer…");
    try {
      await client.users.with({ signal: controller.current.signal }).slow();
      setState("ok");
      setDetail("Answered");
    } catch (error) {
      const cancelled = controller.current?.signal.aborted === true;
      setState(cancelled ? "ok" : "failed");
      setDetail(cancelled ? `Cancelled — ${messageOf(error)}` : messageOf(error));
    }
  };
  return (
    <Card title="Cancel a call" state={state} detail={detail}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Button title="Start" onPress={start} />
        <Button title="Cancel" onPress={() => controller.current?.abort()} />
      </View>
    </Card>
  );
}
