<script setup lang="ts">
import { accounts } from "~/lib/api";

const { data } = await useAsyncData("renew", async () => {
  const first = await accounts.me();
  const second = await accounts.me();
  return { first, second };
});
</script>

<template><pre id="renew">{{ JSON.stringify(data) }}</pre></template>
