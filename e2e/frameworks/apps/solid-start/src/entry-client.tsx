// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

const root = document.getElementById("app");
if (root !== null) mount(() => <StartClient />, root);
