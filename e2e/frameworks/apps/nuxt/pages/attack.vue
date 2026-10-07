<script setup lang="ts">
import { accounts } from "~/lib/api";

const { data } = await useAsyncData("attack", () =>
  accounts.rename({ name: "Mallory" }).then(
    () => "written",
    (error: { status?: number }) => `refused ${error.status ?? "?"}`,
  ),
);
</script>

<template><pre id="outcome">{{ data }}</pre></template>
