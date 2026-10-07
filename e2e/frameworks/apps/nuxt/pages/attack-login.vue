<script setup lang="ts">
import { accounts } from "~/lib/api";

const { data } = await useAsyncData("attack-login", () =>
  accounts.login({ user: "mallory" }).then(
    () => "written",
    (error: { status?: number }) => `refused ${error.status ?? "?"}`,
  ),
);
</script>

<template><pre id="outcome">{{ data }}</pre></template>
