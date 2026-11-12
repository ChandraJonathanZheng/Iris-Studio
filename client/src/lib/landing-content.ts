// Website copy and photos for the landing page (from the 12 Nov 2026 demo). Photos live in public/images.
// Every photo of a student is used with that student's media consent (LEGAL.md §3); replace a file to change a photo.

export interface SitePhoto { caption: string; src: string; lqip?: string }

const img = (name: string) => `/images/${name}.webp`;
const STUDIO_LQIP = 'data:image/webp;base64,UklGRvgAAABXRUJQVlA4IOwAAACwBQCdASoYABIAPu1ur1IppiQiqAgBMB2JQBWHKCpoHyNFySUQTH4NDTcPJucZBSCDcHs24ZAA+7T+RU6ofZnerRD7yq/O8Ndt6ND6vHd7dR0EzKPKQFsAsMVJGN7yKYAPxwX3kSC0pgfLv7eWlE+iU5nzJhWBUetMhiTCsOAf6DfrGRqRubJQAbNv357FQNwu9TWN069waAg4LmbHsEPeiglE9/zif0saKxH6jaKg3Rpr2ENqzQYNSNyqBCeGwRfd0+Jx+bjzyCtn361UG7jOhEtOxRl4ZI4EdiJWBFAndOLLM2WntFKKCpIwAA==';
const PORTRAIT_LQIP = 'data:image/webp;base64,UklGRqoAAABXRUJQVlA4IJ4AAADQBACdASoSABgAPu1ur1IppiQiqAgBMB2JZQC/7A8wKOFNX1IY2wFsqnbgaNdSoAD+5zm+GAqjL5nMC8rHttD9mzNBzGAQNwD2C96bUfE5r9VYEREdIq08gSmwM0vHinwwkp9bpURb4PkR8Jtpm7tEoJ5ICDAQMocyvsT3tn6jjYfGAIEasbcETvKUi2LxgcKtg8lt2DcA6qDnDdIgAA==';

export const HERO: SitePhoto = { caption: 'Iris 在工作室帶學生練唱', src: img('studio-teaching'), lqip: STUDIO_LQIP };

/** 工作室照片 (also used by the events' photo strips). */
export const GALLERY: SitePhoto[] = [
  { caption: '老師和學生聊歌曲的感覺', src: img('gallery-talk') },
  { caption: '腹式呼吸團體練習', src: img('gallery-breathing') },
  { caption: '學生上台演唱，老師現場指導', src: img('gallery-stage') },
  { caption: '合唱練習', src: img('gallery-choir') },
  { caption: '鋼琴伴奏一起練唱', src: img('gallery-piano') },
  { caption: '站姿與暖聲練習', src: img('gallery-warmup') },
  { caption: '共鳴位置講解', src: img('gallery-resonance') },
];

/** 關於 Iris carousel. */
export const ABOUT_PHOTOS: SitePhoto[] = [
  { caption: 'Iris 老師個人照', src: img('iris-portrait'), lqip: PORTRAIT_LQIP },
  HERO,
  ...[1, 2, 4, 6].map((i) => GALLERY[i]),
].slice(0, 6);

/** 課程內容 cards. */
export const LESSONS = [
  { icon: 'mic', title: '把基礎打穩', text: '呼吸、發聲、音準和換聲區，一步一步練到身體記得。', note: '一對一 · 每堂 1 小時' },
  { icon: 'notes', title: '唱你真正想唱的歌', text: '練習從你喜歡的歌開始設計，技巧直接用在歌裡。', note: '流行 · 音樂劇 · 古典' },
  { icon: 'phones', title: '準備重要的舞台', text: '婚禮獻唱、比賽、試鏡前的密集練習，還有工作室發表會。', note: '可和一般課程一起安排' },
] as const;
export type LessonIcon = (typeof LESSONS)[number]['icon'];

/** 學生心得 — published only with each student's consent. */
export const VOICES = [
  { name: '陳小姐', job: '上班族', time: '學了 6 個月', quote: '以前唱高音一定破音，現在知道怎麼用氣息支撐，KTV 終於敢點自己喜歡的歌了。', photo: img('voice-chen') },
  { name: '林先生', job: '準備婚禮獻唱', time: '學了 3 個月', quote: 'Iris 幫我把一首歌拆成小段慢慢練，婚禮當天很穩，太太和家人都很感動。', photo: img('voice-lin') },
  { name: '黃媽媽', job: '孩子國小五年級', time: '學了 1 年', quote: '孩子本來很怕上台，現在每次成果發表會都很期待，自信心進步很多。', photo: img('voice-huang') },
];

/** Gallery rotated so each event starts with a different photo. */
const rotated = (start: number) => GALLERY.map((_, i) => GALLERY[(start + i) % GALLERY.length]);

export interface StudioEvent { title: string; date: string; place: string; summary: string; photos: SitePhoto[] }
export const EVENTS: StudioEvent[] = [
  { title: '秋季小型發表會', date: '2026/10/18（六）', place: '[場地名稱]', summary: '學生們第一次在親友面前完整演唱一首歌，從流行歌到音樂劇選曲，每個人都很勇敢。', photos: rotated(2) },
  { title: '夏日聲樂工作坊', date: '2026/07/26（六）', place: 'Iris Studio A 教室', summary: '半天的呼吸與共鳴密集練習，最後大家一起合唱了一首歌。', photos: rotated(1) },
];

export const INSTAGRAM_URL = 'https://www.instagram.com/iamcheniris/';
export const SOCIAL = [
  { name: 'Instagram', icon: 'instagram', url: INSTAGRAM_URL },
  { name: 'Facebook', icon: 'facebook', url: 'https://www.facebook.com/Iamcheniris/' },
  { name: 'YouTube', icon: 'youtube', url: 'https://www.youtube.com/channel/UCOWU0qWYtGaD6Twe-lZ_pyQ' },
] as const;
export type SocialIcon = (typeof SOCIAL)[number]['icon'];
