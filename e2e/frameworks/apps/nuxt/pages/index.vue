<script setup lang="ts">
import { accounts } from "~/lib/api";

const { data } = await useAsyncData("me", () => accounts.me());
</script>

<template>
  <main>
    <pre id="me">{{ JSON.stringify(data) }}</pre>
    <form method="post" action="/api/login"><button id="login">Sign in</button></form>
    <form method="post" action="/api/rename"><button id="rename">Rename</button></form>
    <a id="logout" href="/logout">Sign out</a>
  </main>
</template>
