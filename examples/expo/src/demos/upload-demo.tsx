import { File, Paths } from "expo-file-system";
import { type ReactNode, useState } from "react";
import { Button } from "react-native";

import { client } from "../client";
import { Card, type CardState } from "./card";
import { messageOf } from "./state-of";

/* A file on the device: React Native's FormData takes one by its address, name and type. */
function deviceFile(): { uri: string; name: string; type: string } {
  const file = new File(Paths.cache, "note.txt");
  file.write(`Written on the device at ${new Date().toISOString()}\n`.repeat(200));
  return { uri: file.uri, name: "note.txt", type: "text/plain" };
}

/** A file from the device sent as a form, its progress reported as it goes. */
export function UploadDemo(): ReactNode {
  const [state, setState] = useState<CardState>("waiting");
  const [detail, setDetail] = useState("Not sent yet");
  const upload = async () => {
    const form = new FormData();
    form.append("file", deviceFile() as unknown as Blob);
    setState("waiting");
    try {
      const stored = await client.files
        .with({ onUploadProgress: (p) => setDetail(`Sending… ${Math.round(p.percent * 100)}%`) })
        .upload(form);
      setState("ok");
      setDetail(`Stored ${stored.name}, ${stored.size} bytes, ${stored.type}`);
    } catch (error) {
      setState("failed");
      setDetail(messageOf(error));
    }
  };
  return (
    <Card title="Upload a file from the device" state={state} detail={detail}>
      <Button title="Upload" onPress={upload} />
    </Card>
  );
}
