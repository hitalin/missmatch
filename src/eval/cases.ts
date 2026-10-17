// 精度の評価セット: 代表的な言葉と「上位に来てほしいサーバー」。
// host は joinmisskey の登録受付中の日本語サーバー（2026-10-17）に実在し、説明文に根拠があるものだけ。
// 「上位に来てほしい」は順位の提案であってサーバーの優劣ではない。説明文が変わったら見直す
import type { ServerInfo } from '$lib/types';

export interface EvalCase {
	id: string;
	turns: string[]; // 最初の言葉 + 絞り込み
	expect: string[]; // 上位 5 件に入ってほしい host（空なら must だけ見る）
	must?: { label: string; test: (s: ServerInfo) => boolean }; // 上位 5 件すべてが満たすべき条件
	note?: string; // 根拠
}

export const CASES: EvalCase[] = [
	{
		id: 'vent',
		turns: ['病み垢として運用したい。弱音や愚痴を吐いても浮かない、静かな場所がいい'],
		expect: ['yami.ski', 'drdr.club', 'kasei.ski', 'm.itsukey.jp'],
		note: '「病んでいい場所」「心の避暑地」（投稿 50 件で愚痴・弱音 0.91）「生きてて偉い」「ごじあいが溢れる」'
	},
	{
		id: 'illust-original',
		turns: ['一次創作のイラストを描いていて、作品を見てもらえる場所'],
		expect: ['misskey.design', 'oekakiskey.com', 'misskey.art'],
		note: '一次創作が主役 / イラストを描く・見る人 / 創作活動をする人'
	},
	{
		id: 'novel',
		turns: ['小説や文章を書いていて、読んでもらいたい'],
		expect: ['misskey.design', 'inokashiraskey.jp'],
		note: 'イラスト・漫画・小説 / 言語創作（文芸）の民'
	},
	{
		id: 'vrchat',
		turns: ['VRChat の人が多いところ'],
		expect: ['buicha.social', 'misskey.niri.la'],
		note: 'VRChat をやっている人 / 主に VRSNS ユーザー向け'
	},
	{
		id: 'trpg',
		turns: ['TRPG の卓募集ができるサーバー'],
		expect: ['takusuki.com'],
		note: 'TRPG プレイヤー向け、卓募集'
	},
	{
		id: 'splatoon',
		turns: ['スプラトゥーンの話ができる'],
		expect: ['ikaskey.bktsk.com'],
		note: '主にスプラトゥーンが好きな人向け'
	},
	{
		id: 'tech',
		turns: ['プログラミングや技術の話がしたい'],
		expect: ['misskey.systems', 'misskey.kyoupro.com', 'msky.work'],
		note: 'IT に関わる人 / 競プロ / 社畜さん特に IT 系'
	},
	{
		id: 'tech-vent',
		turns: ['仕事の愚痴を IT 系の人と言い合いたい'],
		expect: ['msky.work', 'misskey.systems'],
		note: '労働者たちの Misskey / みすてむず'
	},
	{
		id: 'vocal-synth',
		turns: ['ボカロや合成音声の曲を作っている。同じ趣味の人がいるところ'],
		expect: ['voskey.icalo.net', 'nicomedkey.cc'],
		note: '合成音声ソフト関連 / ニコメド作者・愛好者'
	},
	{
		id: 'imas',
		turns: ['アイマスの話を気兼ねなくできる場所'],
		expect: ['live-theater.net', 'unicuskey.com'],
		note: 'ミリオンライブ P 向け / UNICUS 担当 P 向け'
	},
	{
		id: 'anime',
		turns: ['アニメの実況で盛り上がりたい'],
		expect: ['misskey.seitendan.com', 'misskey.stream', 'misskirara.net'],
		note: 'アニメ実況向き / アニメから政治まで / きらら作品'
	},
	{
		id: 'animal',
		turns: ['ペットや動物の写真を見たい'],
		expect: ['misskey.dog'],
		note: '犬による犬のための SNS'
	},
	{
		id: 'food',
		turns: ['ご飯やお酒の話で盛り上がりたい'],
		expect: ['potato.ski', 'kusso-yotta.com'],
		note: '飯テロ系 / 健全なよっぱらい向け'
	},
	{
		id: 'making',
		turns: ['電子工作や 3DCG など、なにか作っている人が集まる場所'],
		expect: ['crafters.aosankaku.net', 'mi0.robotician.jp', 'www.dazuser.com'],
		note: 'なんか作ってる人 / ロボット屋さん / フォトリアル系 3DCG'
	},
	{
		id: 'diary-slow',
		turns: ['日記やひとりごとを気軽に書きたい、流れがゆっくりなところ'],
		expect: ['waff-skey.net', 'misskey.takehi.to', 'drdr.club', 'metreee.com'],
		note: '日記感覚で / 深呼吸できる / 何もしていないをしたい / 小さな灯台'
	},
	{
		id: 'beginner-chat',
		turns: ['初めての Misskey。のんびり雑談できるところ'],
		expect: ['misskey-square.net', 'misskey.day', 'misskey.takehi.to', 'waff-skey.net'],
		note: 'マイペースの参加を歓迎・あたたかく迎え入れる / にぎやかだけどやさしい / 深呼吸できる（毎日 15 人） / 日記感覚で気軽に（毎日 34 人）。初めての人には会話が成り立つ人数が要るので、毎日 10 人未満の鯖は期待に入れない'
	},
	{
		id: 'small-quiet',
		turns: ['小さめで、顔見知りができやすいところ', '大手の喧騒から離れたい'],
		expect: ['mi.cbrx.io', 'misskey.7ka.org', 'sns.copi.pe'],
		note: '大きなサーバーの喧騒から離れたい方に / 小規模で長期的 / 小規模な汎用'
	},
	{
		id: 'roleplay',
		turns: ['なりきりやロールプレイをしたい'],
		expect: ['n-kaiwai.work', 'ojousama-tea.party'],
		note: 'なりきり界隈 / お嬢様ロールプレイ'
	},
	{
		id: 'parenting',
		turns: ['子育て中の人と話したい'],
		expect: ['mi.hiyoko.club'],
		note: '子育て中の方・経験のある方'
	},
	{
		id: 'latest-features',
		turns: ['最新の Misskey を使いたい。機能が多いところ'],
		expect: ['a2c.misskey.casa', 'prismisskey.space', 'misskey.flowers'],
		note: '全自動更新 / 最先端・高機能 / 独自機能'
	},
	{
		id: 'lively',
		turns: ['人が多くてにぎやかなところ'],
		expect: ['misskey.day', 'nijimiss.moe', 'misskey-square.net', 'takusuki.com'],
		note: '1 日の読者が 1,200 人を超える 4 件（数字で決まる）'
	},
	{
		id: 'oshi',
		turns: ['推しの話を気兼ねなくできる場所'],
		expect: ['nijimiss.moe', 'm.eskey.click', 'live-theater.net'],
		note: 'あらゆる好きが交差する・好きを語れる / あんスタファン向け / ミリオンライブ P 向け'
	},
	{
		id: 'game-play',
		turns: ['ゲームの話ができて、一緒に遊ぶ人も見つかる'],
		expect: ['ikaskey.bktsk.com', 'takusuki.com', 'stormskey.works', 'mk.puzzlesskey.com'],
		note: 'スプラトゥーン / TRPG 卓募集 / Stormworks / Fediverse のゲーセン'
	},
	{
		id: 'fanart',
		turns: ['二次創作のイラストを載せたい'],
		expect: ['mivatter.com', 'oekakiskey.com', 'misskey.design', 'misskey.art'],
		note: 'オリジナル、二次創作問わず / 一次創作、二次創作 / 二次創作も一定のルールで許可 / 創作活動をする人'
	},
	{
		id: 'ai-art',
		turns: ['AI で生成したイラストを気兼ねなく投稿したい'],
		expect: ['sns.ourt-ai.work'],
		note: '生成 AI コミュニティ'
	},
	{
		id: 'solo-quiet',
		turns: ['ひとりごと用のサブ垢。干渉が少なくて静かなところ'],
		expect: ['chiranote.com', 'torikago-suki.net', 'metreee.com'],
		note: 'ホームタイムラインのみ（LTL なし） / 隠居 / 大きな海の端にある小さな灯台'
	},
	{
		id: 'kemono',
		turns: ['ケモノやけもみみが好き'],
		expect: ['virtualkemomimi.net', 'misskey.bakedbanana.net'],
		note: 'バーチャルとけもみみ / ケモナー'
	},
	{
		id: 'longform',
		turns: ['長文をゆっくり書きたい。マイペースに参加できるところ'],
		expect: ['misskey-square.net'],
		note: '長文の投稿や、マイペースの参加を歓迎する独自機能'
	},
	{
		id: 'english',
		turns: ['英語でも交流できる、海外の人もいるところ'],
		expect: ['feels.moe', 'coretalk.space'],
		note: '英語の説明文で運営は米国 / blockchain enthusiasts（英語）'
	},
	{
		id: 'email-free',
		turns: ['メアドなしで登録できるところ'],
		expect: [],
		must: { label: 'メアド不要', test: (s) => !s.emailRequired },
		note: '読み取りが絶対条件に入れば上位 5 件すべてメアド不要になる'
	},
	{
		id: 'ads-free-rules',
		turns: ['広告がなくて、ルールがしっかりしている'],
		expect: [],
		must: { label: '広告なし', test: (s) => !s.adsEnabled },
		note: '読み取りが絶対条件に入れば上位 5 件すべて広告なしになる'
	},
	{
		id: 'niche-houshin',
		turns: ['封神演義が好き'],
		expect: ['houshindai.net'],
		note: '固有名で一意に決まる、拾えて当然のケース'
	}
];
