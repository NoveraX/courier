"use client";

import { createProxyCaller } from "@noverax/courier";
import { useState } from "react";

import { accountsRoutes } from "../../lib/routes";

const proxy = createProxyCaller(accountsRoutes);

/* A client component, calling through the proxy route. */
export default function ProxyPage() {
  const [state, setState] = useState("");
  const run = async () => {
    await proxy.login({ user: "proxy" });
    setState(JSON.stringify(await proxy.me()));
  };
  return (
    <main>
      <button id="proxy-run" type="button" onClick={run}>
        Run
      </button>
      <pre id="proxy">{state}</pre>
    </main>
  );
}
