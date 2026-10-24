import { describe, expect, it } from 'vitest';
import { mkServer, mkVibe } from '$lib/fixtures.test-helper';
import {
	cosine,
	EMBED_MODELS,
	packTable,
	pickCandidates,
	queryText,
	serverText,
	textHash,
	unpackTable
} from './embed';

describe('serverText', () => {
	it('名前・説明・ルール・雰囲気・話題を 1 本の日本語にする', () => {
		const text = serverText({
			server: mkServer({
				host: 'a.tld',
				name: 'えー',
				description: '静かに暮らす人の場所',
				serverRules: ['攻撃しない', '宣伝は控えめに']
			}),
			vibe: mkVibe({ host: 'a.tld', tone: 1 }) // illust 0.8
		});
		expect(text).toContain('えー');
		expect(text).toContain('静かに暮らす人の場所');
		expect(text).toContain('攻撃しない / 宣伝は控えめに');
		expect(text).toContain('ほのぼの');
		expect(text).toContain('イラスト');
	});
	it('雰囲気が無くても説明文だけで作れる', () => {
		expect(serverText({ server: mkServer({ description: null }), vibe: null })).toContain('A');
	});
	it('textHash は内容が変われば変わる', () => {
		expect(textHash('a')).not.toBe(textHash('b'));
		expect(textHash('a')).toBe(textHash('a'));
	});
});

describe('queryText', () => {
	it('言葉の並びを改行でつなぐ', () => {
		expect(queryText(['静かな場所', '小さめ'])).toBe('静かな場所\n小さめ');
	});
});

describe('cosine / pickCandidates', () => {
	it('コサイン類似度', () => {
		expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
		expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
		expect(cosine([0, 0], [1, 0])).toBe(0);
	});
	it('類似度の高い順に K 件を候補にし、外側には 0.5 未満の値を類似度順に付ける', () => {
		const table = {
			hosts: ['a', 'b', 'c', 'd'],
			hashes: { a: 'x', b: 'x', c: 'x', d: 'x' },
			vectors: [
				[1, 0],
				[0.9, 0.1],
				[0, 1],
				[0.5, 0.5]
			]
		};
		const { candidates, others } = pickCandidates([1, 0], table, 2);
		expect(candidates).toEqual(['a', 'b']);
		expect(Object.keys(others)).toEqual(['d', 'c']); // 似ている順
		expect(others.d).toBeGreaterThan(others.c);
		expect(others.d).toBeLessThan(0.5);
	});
	it('K が 0 なら全部候補（絞らない）', () => {
		const table = {
			hosts: ['a', 'b'],
			hashes: { a: 'x', b: 'x' },
			vectors: [
				[1, 0],
				[0, 1]
			]
		};
		expect(pickCandidates([1, 0], table, 0).candidates).toEqual(['a', 'b']);
	});
	it('表に無い host は候補に入れない（埋め込みが間に合っていない）', () => {
		const table = { hosts: ['a'], hashes: { a: 'x' }, vectors: [[1, 0]] };
		expect(pickCandidates([1, 0], table, 5).candidates).toEqual(['a']);
	});
});

describe('packTable / unpackTable', () => {
	it('ベクトルを Float32 の base64 にして往復できる', () => {
		const table = {
			hosts: ['a', 'b'],
			hashes: { a: 'h1', b: 'h2' },
			vectors: [
				[0.5, -0.25],
				[1, 0]
			]
		};
		const packed = packTable(table);
		expect(typeof packed).toBe('string');
		const back = unpackTable(packed);
		expect(back?.hosts).toEqual(['a', 'b']);
		expect(back?.hashes).toEqual({ a: 'h1', b: 'h2' });
		expect(back?.vectors[0][0]).toBeCloseTo(0.5);
		expect(back?.vectors[0][1]).toBeCloseTo(-0.25);
		expect(unpackTable('not json')).toBeNull();
	});
});

describe('EMBED_MODELS', () => {
	it('既定のモデルがある', () => {
		expect(Object.keys(EMBED_MODELS)).toContain('bge-m3');
	});
});
