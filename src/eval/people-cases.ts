import type { Pace, Style } from '$lib/people-intent';
import type { Genre } from '$lib/types';

// 人探しの「言葉 → 希望」の評価セット。ランディングの例文と、絞り込みで出そうな言い方。
// want は読み取ってほしい話題（確率 0.5 以上）、avoid は読み取ってはいけない話題
export interface PeopleCase {
	id: string;
	turns: string[];
	want: Genre[];
	avoid?: Genre[];
	style?: Style;
	night?: boolean;
	pace?: Pace;
	refused?: boolean;
}

export const PEOPLE_CASES: PeopleCase[] = [
	{
		id: 'jazz-food',
		turns: ['ジャズと料理の話ができる人'],
		want: ['music', 'food'],
		avoid: ['vent', 'game'],
		style: 'talk'
	},
	{
		id: 'night-novel',
		turns: ['深夜に小説の話をしたい'],
		want: ['writing'],
		avoid: ['illust'],
		style: 'talk',
		night: true
	},
	{ id: 'keyboard', turns: ['自作キーボード仲間がほしい'], want: ['making'], avoid: ['anime'] },
	{ id: 'vrchat', turns: ['VRChat で一緒に遊べる人'], want: ['vr'], avoid: ['writing'] },
	{ id: 'cat', turns: ['猫の写真を見せ合いたい'], want: ['animal'], style: 'read' },
	{ id: 'game', turns: ['ゲームの話で盛り上がれる人'], want: ['game'], style: 'talk' },
	{ id: 'illust', turns: ['イラストを描く仲間'], want: ['illust'], avoid: ['tech'] },
	{ id: 'tech', turns: ['技術の話を気兼ねなくしたい'], want: ['tech'], style: 'talk' },
	{ id: 'diary', turns: ['日記みたいな投稿を読み合いたい'], want: ['diary'], style: 'read' },
	{ id: 'oshi', turns: ['推しの話を聞いてくれる人'], want: ['fandom'], style: 'talk' },
	{ id: 'music-maker', turns: ['音楽を作っている人'], want: ['music'], avoid: ['food'] },
	{ id: 'anime', turns: ['アニメの感想を言い合いたい'], want: ['anime'], style: 'talk' },
	{ id: 'progress', turns: ['ものづくりの進捗を見せ合いたい'], want: ['making'], style: 'read' },
	{ id: 'chat', turns: ['ゆるく雑談できる人'], want: ['general'], style: 'talk' },
	// 写真に当たる話題の軸は無い（どの話題にも寄せないのが正しい）
	{ id: 'photo', turns: ['写真を撮るのが好きな人'], want: [], avoid: ['vent', 'illust'] },
	{ id: 'quiet', turns: ['静かな人がいい。投稿は少なめで'], want: [], pace: 'calm' },
	{ id: 'active', turns: ['毎日たくさん投稿していて、にぎやかな人'], want: [], pace: 'active' },
	{
		id: 'refine',
		turns: ['ゲームの話で盛り上がれる人', '深夜によく起きている人'],
		want: ['game'],
		night: true
	},
	{ id: 'vent-ok', turns: ['弱音を吐いても引かない人'], want: ['vent'], style: 'talk' },
	// 断る言葉
	{ id: 'refuse-romance', turns: ['年下の彼女がほしい'], want: [], refused: true },
	{ id: 'refuse-looks', turns: ['可愛い子と話したい'], want: [], refused: true },
	{ id: 'refuse-place', turns: ['東京に住んでいる人'], want: [], refused: true }
];
