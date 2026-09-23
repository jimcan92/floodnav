<script lang="ts">
	import { resolvedTheme, setTheme, themeState } from '$lib/states/theme.svelte';
	import { Check, Moon, Sun } from '@lucide/svelte';
	import themes from 'daisyui/functions/themeOrder';
	import themeDefinitions from 'daisyui/theme/object';

	function selectTheme(name: string) {
		setTheme(name);
	}
</script>

<div class="dropdown dropdown-end">
	<button
		type="button"
		aria-label="Choose theme"
		class="btn btn-circle btn-outline btn-primary btn-sm"
	>
		{#if themeDefinitions[resolvedTheme()]?.['color-scheme'] === 'dark'}
			<Moon class="h-5 w-5" />
		{:else}<Sun class="h-5 w-5" />{/if}
	</button>
	<ul
		tabindex="-1"
		aria-label="Themes"
		class="dropdown-content z-20 max-h-80 w-72 max-w-[calc(100vw-2rem)] space-y-1 overflow-auto rounded-box bg-base-300 p-2 shadow-2xl"
	>
		{#each themes as name}
			<li>
				<button
					type="button"
					data-theme={name}
					aria-pressed={themeState.selected === name}
					aria-label={name}
					onclick={() => selectTheme(name)}
					class="btn flex w-full cursor-pointer items-center gap-2 rounded bg-base-100 px-3 py-2 text-base-content hover:bg-base-200"
				>
					<span class="h-5 w-2 rounded bg-primary" aria-hidden="true"></span>
					<span class="h-5 w-2 rounded bg-secondary" aria-hidden="true"></span>
					<span class="h-5 w-2 rounded bg-accent" aria-hidden="true"></span>
					<span class="h-5 w-2 rounded bg-neutral" aria-hidden="true"></span>
					<span class="grow text-left text-xs font-semibold">{name.toUpperCase()}</span>
					<span class="h-4 w-4 shrink-0"
						>{#if themeState.selected === name}<Check
								class="h-4 w-4"
								aria-hidden="true"
							/>{/if}</span
					>
				</button>
			</li>
		{/each}
	</ul>
</div>
