<script>
let { data } = $props();
</script>

<pre id="me">{JSON.stringify(data.me)}</pre>
<form method="POST" action="?/login"><button id="login">Sign in</button></form>
<form method="POST" action="?/rename">
  <input name="name" value="Ada Lovelace" />
  <button id="rename">Rename</button>
</form>
<a id="logout" href="/logout" data-sveltekit-reload>Sign out</a>
