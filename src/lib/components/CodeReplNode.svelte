<script lang="ts">
	const frameworks = [
		{ label: 'Svelte', value: 'svelte', url: 'https://svelte.dev/repl' },
		{ label: 'React', value: 'react', url: 'https://codesandbox.io/s/new/react' },
		{ label: 'Vue', value: 'vue', url: 'https://sfc.vuejs.org/' }
	];

	let selected = $state('svelte');
</script>

$derived selectedUrl = frameworks.find(f => f.value === selected)?.url || frameworks[0].url;

<div class="repl-embed-node">
	<div class="repl-toolbar">
		<label for="framework-select">Framework:</label>
		<select id="framework-select" bind:value={selected}>
			{#each frameworks as fw}
				<option value={fw.value}>{fw.label}</option>
			{/each}
		</select>
	</div>
	<iframe src={selectedUrl()} class="repl-iframe" allow="clipboard-write; clipboard-read;" />
</div>

<style>
	.repl-embed-node {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background: #18181b;
		color: #fff;
		border-radius: 8px;
		overflow: hidden;
	}
	.repl-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 8px 12px;
		background: #23272e;
		border-bottom: 1px solid #222;
	}
	.repl-toolbar label {
		font-size: 14px;
		color: #b5b5b5;
	}
	.repl-iframe {
		flex: 1 1 auto;
		width: 100%;
		height: 500px;
		min-height: 300px;
		border: none;
		background: #fff;
	}
</style>
