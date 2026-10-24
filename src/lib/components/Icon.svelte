<script lang="ts">
	// インライン SVG アイコン（Feather 風: stroke 2、fill なし）。絵文字は使わない
	export type IconName =
		| 'menu'
		| 'search'
		| 'heart'
		| 'x'
		| 'user'
		| 'plus'
		| 'flame'
		| 'more'
		| 'send'
		| 'chevron'
		| 'sparkle'
		| 'edit'
		| 'trash'
		| 'sliders'
		| 'undo'
		| 'check'
		| 'external'
		| 'power';
	let { name, size = 20, filled = false }: { name: IconName; size?: number; filled?: boolean } =
		$props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill={filled ? 'currentColor' : 'none'}
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'menu'}
		<path d="M3 6h18M3 12h18M3 18h18" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
	{:else if name === 'heart'}
		<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
	{:else if name === 'x'}
		<path d="M6 6l12 12M18 6L6 18" />
	{:else if name === 'user'}
		<circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'flame'}
		<path
			d="M12 3c1 3.2 4 4.3 4 8.2A4.2 4.2 0 0 1 12 15a4.2 4.2 0 0 1-4-3.8C8 8.8 9.6 7.6 9.6 5.2 10.6 5.8 11.4 6.8 11.5 8 12.4 6.6 12.5 4.8 12 3Z"
		/>
		<path d="M6.5 13.5C6.5 17 9 20 12 20s5.5-3 5.5-6.5" />
	{:else if name === 'more'}
		<circle cx="5" cy="12" r="1.2" fill="currentColor" />
		<circle cx="12" cy="12" r="1.2" fill="currentColor" />
		<circle cx="19" cy="12" r="1.2" fill="currentColor" />
	{:else if name === 'send'}
		<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
	{:else if name === 'chevron'}
		<path d="M6 9l6 6 6-6" />
	{:else if name === 'sparkle'}
		<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
	{:else if name === 'edit'}
		<path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
	{:else if name === 'trash'}
		<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
	{:else if name === 'sliders'}
		<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
	{:else if name === 'undo'}
		<path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" />
	{:else if name === 'check'}
		<path d="M5 12l5 5L20 7" />
	{:else if name === 'external'}
		<path d="M14 4h6v6M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
	{:else if name === 'power'}
		<path d="M7 6a7.75 7.75 0 1 0 10 0" /><path d="M12 4v8" />
	{/if}
</svg>

<style>
	svg {
		flex-shrink: 0;
	}
</style>
