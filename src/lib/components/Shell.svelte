<script module lang="ts">
	export type Tab = 'discover' | 'likes' | 'passed' | 'you';
	export const TABS: Tab[] = ['discover', 'likes', 'passed', 'you'];
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Search } from '$lib/search';
	import Drawer from './Drawer.svelte';
	import MobileBar from './MobileBar.svelte';
	import Sidebar from './Sidebar.svelte';

	// 画面の骨組み（yamix 型）: デスクトップは「固定幅のサイドバー + 本文」、
	// モバイルは「本文 + 下タブバー」で、同じサイドバーをドロワーに入れて使い回す
	let {
		tab,
		likes,
		passed,
		discoverEnabled,
		searches,
		current,
		onchange,
		onselect,
		onrename,
		ondelete,
		children
	}: {
		tab: Tab | null; // null = どのタブでもない画面（探すランディング）
		likes: number;
		passed: number;
		discoverEnabled: boolean;
		searches: Search[];
		current: string;
		onchange: (t: Tab) => void;
		onselect: (id: string) => void;
		onrename: (id: string, title: string) => void;
		ondelete: (id: string) => void;
		children: Snippet;
	} = $props();

	let drawer = $state(false);
	// ドロワーの中で何かを選んだら閉じる
	const closing =
		<A extends unknown[]>(f: (...a: A) => void) =>
		(...a: A) => {
			f(...a);
			drawer = false;
		};
</script>

<div class="shell">
	<aside class="side">
		<Sidebar
			{tab}
			{likes}
			{passed}
			{discoverEnabled}
			{searches}
			{current}
			{onchange}
			{onselect}
			{onrename}
			{ondelete}
		/>
	</aside>
	<div class="content">
		<div class="inner">
			{@render children()}
		</div>
	</div>
	<MobileBar {tab} {likes} {passed} {discoverEnabled} {onchange} onmenu={() => (drawer = true)} />
	{#if drawer}
		<Drawer onclose={() => (drawer = false)}>
			<Sidebar
				{tab}
				{likes}
				{passed}
				{discoverEnabled}
				{searches}
				{current}
				onchange={closing(onchange)}
				onselect={closing(onselect)}
				{onrename}
				{ondelete}
			/>
		</Drawer>
	{/if}
</div>

<style>
	.shell {
		display: flex;
		min-height: 100dvh;
	}
	.side {
		display: none;
	}
	.content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		padding: 10px 16px calc(var(--nav-h) + env(safe-area-inset-bottom) + 16px);
	}
	.inner {
		flex: 1;
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: var(--maxw);
		margin: 0 auto;
	}
	@media (min-width: 900px) {
		.side {
			display: block;
			position: sticky;
			top: 0;
			height: 100dvh;
			width: var(--rail-w);
			flex-shrink: 0;
			border-right: 1px solid var(--border);
		}
		.content {
			padding: 16px 40px 24px;
		}
		.inner {
			max-width: var(--desktop-maxw);
		}
	}
</style>
