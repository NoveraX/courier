import type { ReactNode } from "react";
import { Button } from "react-native";

import { q } from "../client";
import { Card, type CardState } from "./card";
import { messageOf } from "./state-of";

const stateOfLive = (status: string, error: unknown, got: boolean): CardState =>
  error ? "failed" : got || status === "connected" ? "ok" : "waiting";

/** A stream of server-sent events, and a WebSocket channel that answers what it is sent. */
export function LiveDemo(): ReactNode {
  const ticks = q.live.useSubscription("ticks");
  const chat = q.live.useChannel("chat");
  return (
    <>
      <Card
        title="useSubscription (server-sent events)"
        state={stateOfLive(ticks.status, ticks.error, ticks.data !== undefined)}
        detail={
          ticks.error ? messageOf(ticks.error) : `${ticks.status} — tick ${ticks.data?.n ?? "…"}`
        }
      />
      <Card
        title="useChannel (WebSocket)"
        state={stateOfLive(chat.status, chat.error, chat.lastMessage !== undefined)}
        detail={
          chat.error
            ? chat.error.message
            : `${chat.status} — ${chat.lastMessage?.text ?? "nothing yet"}`
        }
      >
        <Button title="Send “hello”" onPress={() => chat.send({ text: "hello" })} />
      </Card>
    </>
  );
}
