import { Logo } from '../components/Logo';
import { FOOTER_LINKS } from '../lib/legal';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { Photo } from '../components/ui';
import { CONSULT_TIME_LABEL } from '../lib/date';
import { useReels, useSendConsult } from '../lib/queries';
import heroPhoto from '../assets/hero.webp'; // Iris on stage (B&W), wide — desktop
import about1 from '../assets/about-1.webp';
import about2 from '../assets/about-2.webp';
import about3 from '../assets/about-3.webp';
import about4 from '../assets/about-4.webp';
import about5 from '../assets/about-5.webp';
import about6 from '../assets/about-6.webp';
import heroMobile from '../assets/hero-mobile.webp'; // same moment, 3:4 portrait — phones
import studioPhoto from '../assets/studio-class.webp'; // the earlier hero: Iris teaching in the studio
import voiceChen from '../assets/voice-chen.webp';
import voiceLin from '../assets/voice-lin.webp';
import voiceHuang from '../assets/voice-huang.webp';
import ev1 from '../assets/events/ev1.webp';
import ev2 from '../assets/events/ev2.webp';
import ev3 from '../assets/events/ev3.webp';
import ev4 from '../assets/events/ev4.webp';
import ev5 from '../assets/events/ev5.webp';
import ev6 from '../assets/events/ev6.webp';
import ev7 from '../assets/events/ev7.webp';
import { closeModal, openModal } from '../lib/modalMotion';

// Tiny blurred preview shown while the hero photo loads (24×18 px, ~0.3 KB).
const STUDIO_LQIP = 'data:image/webp;base64,UklGRsQAAABXRUJQVlA4ILgAAABwBACdASoYABAAPu1iqU2ppaOiMAgBMB2JQBOmXkS2Qy3CQb74XvwJGrEfAAD7tQI/AWOuShYAXK/VhwI5fLNM9hQoFtFczcS4piqaJeprJ2zoySS/+TjtJU7Xl/BwW2zU+EcnNWfR7IA/S2Q9Kyfu/14q8Y5bEI56tDKGN5D2MjzHMfnwzvh7xC3EJtOTx3dRRvwaZW1PpcMaIAYU0SpZ/YqhqrBycU3E3adhLKo01EdPxUbiSuAA';
const HERO_LQIP = 'data:image/webp;base64,UklGRqIAAABXRUJQVlA4IJYAAADwAwCdASoYABAAPu1iqU2ppaOiMAgBMB2JaQAD5RHZNUf1LrOvrvOgAP7AQS7mvRk2VoBTZGthmDZr3nHskxSCJSMBqaCQyogoXlw4QxVG25CmNnETxaNj6YpWsnUPmqapiGOJWCd1VvwrJ+D3XfytINIrui3cFkZx82ANk7s0ZxMDqo6T+H08u+kugAAwNggjvlWVgAA=';

/**
 * Public landing page. It is the same for every visitor, so `npm run build` pre-renders it to static HTML (#7):
 * the text is visible before any JavaScript runs, which helps first paint and search engines.
 * Bracketed text = placeholders until Iris provides real content (and real, consented testimonials).
 */
// SAMPLE text + photos only, to show the layout. Before launch: real testimonials and photos, each with the student's written
// consent (the 肖像與影音授權 / media consent) — a photo of a real person must never go up without it.
const SAMPLE_VOICES = [
  { name: '陳小姐', job: '上班族', time: '學了 6 個月', quote: '以前唱高音一定破音，現在知道怎麼用氣息支撐，KTV 終於敢點自己喜歡的歌了。', photo: voiceChen, lqip: 'data:image/webp;base64,UklGRqoAAABXRUJQVlA4IJ4AAAAwBACdASoQABQAPu1iqU2ppaOiMAgBMB2JQBOgMXwbd+l74PFUq95XTIAA9rCymC3hY3TdwDd68m8xXvwAPnk0yceUZIVFyvFCOudjHx3LD0DIV4GrY2R4luR1czEYiPkj7l81Ij6oqfOI+aL5V5Z2TqW2vaGQWZ5zBWJBrBfZkcqk6DbbQ1bJZW6XCf76L4liRXK+lpOvkVAQJ7dwAA==' },
  { name: '林先生', job: '準備婚禮獻唱', time: '學了 3 個月', quote: 'Iris 幫我把一首歌拆成小段慢慢練，婚禮當天很穩，太太和家人都很感動。', photo: voiceLin, lqip: 'data:image/webp;base64,UklGRrAAAABXRUJQVlA4IKQAAABwBACdASoQABQAPu1iqU2ppaOiMAgBMB2JYgCdMoAlvRGYQsAuSJsk8PTdgADifDAVHJNbKsKc6PGHUO7Ph0t2RYycLbnjGbeOFRqOxEO9EYaetsin5/paLjgLJHmlgB0EKYcWB0APPvt5T27LP8i/E68GhK65tHgn1fCNyHMF9gmV+sWcULAqo5SaNPmLERPq54qHFPLdxOYUbB6orl+5gJYAAA==' },
  { name: '黃媽媽', job: '孩子國小五年級', time: '學了 1 年', quote: '孩子本來很怕上台，現在每次成果發表會都很期待，自信心進步很多。', photo: voiceHuang, lqip: 'data:image/webp;base64,UklGRpQAAABXRUJQVlA4IIgAAABQBACdASoQABQAPu1iqU2ppaOiMAgBMB2JQBOmUABiIghZeaRyZ3MQ21AAAP7ppvipA23aAM+sNenQIfKZPivFw8BYd1lafo5A5m+rk4Es1o+uBHZipwmkZX6BxdC9ZgTMdWboiuS6lDLIkyxPZ7bfhXwPh4RlRSw719bBRBH2HuURylR8AAAA' },
];

// SAMPLE events. Each keeps 7 photo slots; the page shows 1 featured + 2 thumbnails, the rest behind 查看更多照片.
// SAMPLE photos (7). Each event shows them in a different order, so the two featured photos are not the same.
const EVENT_PHOTOS = [
  { caption: '老師和學生聊歌曲的感覺', src: ev1, lqip: 'data:image/webp;base64,UklGRtIAAABXRUJQVlA4IMYAAADQBQCdASoYABIAPu1sq1EppaOiqAqpMB2JQBajcj/IBDILQeaFcQSZ1d7escLw/QBCFnVRbeYAAP7CLU7tr7j1367oZp1L7cy6dyog1vcyKjbEbHINSaM+12RWlye9jvnrGHO7cIx31+CKu1bp2mm1s9A6eHRif41r79cdRLeODiBNqMxtt6lYC6AmjZkyxFriUWMNPznHQk8/AN2QqGxG9VNensCfYDCY4vUO/9Fp2RwYDGv8urnLIIMy6L1bMj7cgXAAAAA=' },
  { caption: '腹式呼吸團體練習', src: ev2, lqip: 'data:image/webp;base64,UklGRvIAAABXRUJQVlA4IOYAAABwBQCdASoYABIAPu1sq1EppiOiqAqpMB2JQAB8nBlzv9sxAf5fl6QA41KXuPWrQ41s5kWAAPtpJ468m3dV8w0Dp+eyThybEtbFGHnDwMQxHJKgFM5QFGZ7qSjtBcH7ucAiOuQ62slYiarJG8cQXz5YGO4EXJCvmD9XLWb2wGb3PlWrBsUfjyqQVmXdlDsIU1Z+jPc3GCyibH9EYbxeQF9kYZIf3rX9rIPridnbmjGB4DDUnJLAy+gXXNYRsffdvYA7yP6erB01BDz1R43MUuFA5oit7Xnay4ANM87AZs4LLk9QQgAAAA==' },
  { caption: '學生上台演唱，老師現場指導', src: ev3, lqip: 'data:image/webp;base64,UklGRuAAAABXRUJQVlA4INQAAACwBQCdASoYABIAPu1sq1EppaOiqAqpMB2JYwCdG1HE2B73hst+KLEtJsBYgcT/oULymwdfD7AA/qKIRHkm47CbB9mtvXUB8PWVp6WLnd4Toas/R0KCmjx8+OkjYnxONEAW5U/woBK7J/IaMoAbVOp6dZ4ZVnP3dcMUC/gmV5I7oJXh/BJRKJ3QVawmoi9caj5HMjSAFNcdjtuD4XIHu+nJtIONHXZayWtoa+sW1sN93JtLN9dZC4ZyZins+CgAu1xmEgvOvW5iSfZDHWaT1Pee74AAAA==' },
  { caption: '合唱練習', src: ev4, lqip: 'data:image/webp;base64,UklGRtQAAABXRUJQVlA4IMgAAABQBQCdASoYABIAPu1qrFEppaQiqAqpMB2JQAECBdERo6E3TodxXl7yGOqgws37U8HhIYAA/qVq2gKGSMqdrC1mha8ao63kj8iGlkDVs87xgscOf83zCyQgSQQs3sG0Ra84L9RcP8eXosVTnslQuVH/QZmdsiiTcpBNll2RlsIBM4BxZJOLiAbVrNIviviwXHyeRzjv4AUK79A4RHIePZxwHo1VG4186Qw+HnYaKmmxLx9c8zw1zWqjFlXS3WofjcQC7GRSSIAAAA==' },
  { caption: '鋼琴伴奏一起練唱', src: ev5, lqip: 'data:image/webp;base64,UklGRuQAAABXRUJQVlA4INgAAACQBQCdASoYABIAPu1sqlEppaOiqAqpMB2JYwC/OywTpIQCQU48zK5iq2rtNn2uhfv6rdeFpADOIMTARx0FU6bhDaZ/0Czl1ywQdaoITTcNSTeC+r7zynClcYTjhkhuP05YGIJ6peUQKiGrSU8A4VPXEloerVhJcXAPsjtGE/fV/dJs2T98iVfndDQb35pEAG7AYFLGe4NwKdu5jbq52tfLHhBrhGQ2VDFi4wWnC9/NhDKjCjjtdrnFDotH0/S4HfMorjvt5l/QDvairtM6GYK39nlyFjA/bAA=' },
  { caption: '站姿與暖聲練習', src: ev6, lqip: 'data:image/webp;base64,UklGRgoBAABXRUJQVlA4IP4AAADwBQCdASoYABIAPu1sqlEppaOiqAqpMB2JYwCdMxglyArOZfZ93Xb+HitSveKwPUNz7vyCxXI8PAD2u7Rlh3O9GQeUkq1xuhPDDh6DecAjCjlYcA+FUs48VMEgNjoxXWivHQbOaHKLxHTZdlYePP0qB9dNOVvDV4YWXR9pS+U/k6npggyPpOWHBFhDwDrUecjaicLwud7w/dAI463tfduJqfqne+oKglGTUUUe2qGBt1PSy2QBxwAkQAQEGoAUjOlQ/bSf4nxR/vdh2HeTIP3k9Iy1t5wyu6wh0YwTsgtwRQ6KzEUaNHMG79nyOb0qWjbnxxPlWIz/lIB1uAXgAA==' },
  { caption: '共鳴位置講解', src: ev7, lqip: 'data:image/webp;base64,UklGRvIAAABXRUJQVlA4IOYAAADQBQCdASoYABIAPu1sq1EppaOiqAqpMB2JYgCdMtV1sLtPKR6wsOs/DEo/DdNAMiF/GpMS1UAAAPzqI5d9eZTWxZgqeA7nPzVerotaGSdR0BiK6Yl07n6/Ew/kYIlsUZtRNmnxgMVOSLnEXZqEvosJUnaN/bly4Sns0oimg3cfAcbvsNG4Ga3OT5X4Tb06Mk43Om6YNbWVbC0PjNfUswAJFlGJ82QqWLZXhFSVjSlaW5aC9/BW+Re2OYYdv3I8b3/sXg8+GUs4uGrCzhk/ycw0GyvRfHoRPmKEps/vMPLPSEdLO6hgAA==' },
];
// 關於 Iris carousel: at most 6 photos (more would make a 60-second loop nobody waits for)
/** 關於 Iris carousel — Iris's own studio photos (small originals upscaled 4× with EDSR). `pos` = focal point for the 4:3 crop. */
const ABOUT_PHOTOS = [
  { caption: 'Iris 在工作室的個人照', src: about1, lqip: 'data:image/webp;base64,UklGRpIAAABXRUJQVlA4IIYAAAAwBACdASoYABAAPu1iqU2ppaQiMAgBMB2JYgCdMoADCpgCilfwJrfYhsAA/uepXJ3XGzbDZENPk+AQhvY4XzqgLITjEXVYBMO7okn82QMWz5BNkrTVSua8GSLTglDG6wHG+fAi9aE2mzczCf/U9qafjK5P6KEyUN/1EGF6m+8vBI7yhooAAA==', pos: '50% 32%' },
  { caption: 'Iris 在鍵盤前帶練', src: about2, lqip: 'data:image/webp;base64,UklGRiwBAABXRUJQVlA4ICABAACwBgCdASoYACQAPu1oqk6ppiOiKqwBMB2JZgCo9EZ1oJ4ab4IgaD6nOBB/aqU8NE60xWVhMW3R/rjxJ9zQGAD+6qZnnW4+at+dwSBRXhdZEd9w/aMIcXN9wtZU82doJwbmmYigP9zu8YTSlUqwVX+CN6Fs1M0C7Ait8R7k8t3rPe3WvlxhPB9eKj9W0mqYGE9Kfm7nnd8ZQ6qiGo6oagv2cHs0lobKzqhqSGPS1Lai03OlRfh1QMt8q/1Ys8zhdISCfPmD/ZERIGOmyHhYe9IWx+72BufrIsrvbMc1FmdHcCrKXiQ4MFIaHVVh6d/2UDT1VG9S2XStERXgBaxGGGapziuWBzn5sbRfPrwmpWT69UGRmZ+7HxI8k2wR9qXwAAA=', pos: '50% 22%' },
  { caption: 'Iris 一邊彈琴一邊指導學生', src: about3, lqip: 'data:image/webp;base64,UklGRigBAABXRUJQVlA4IBwBAADQBgCdASoYACQAPu10slOppqSipWgBMB2JQBdmcBS4hxVnCJmb1IhQvh0D/BtSlFy99gmnKRJgORiVNXyZhAAA/u2Zqq+KEPNnwCGGyIPrh/Ce8sVDu2NUl6m3l+J+G0XM0nzcyiaLDVq0QOvGx12jZBo4jqxhskTdjhhSLIncBBqlLpqvVlsfHFotFiKcM27pyWdxdoa+s2YQLS5dA+t1fvkpOVXshxT03EavPzCMs9qo2PYFlaLodaKU2cZHUau/m1qKM6d6oc/bkXitXrLjxUPYWwNN24hefxPDsOl5z0C7L3Y3RDbK4ubURuqe41ror74Pjmg6NKu9nLeU6yKsDMkkSlFEdNRMlYv7TstSWsznkwH56UIa2YE4AA==', pos: '45% 30%' },
  { caption: 'Iris 帶團體一起開嗓', src: about4, lqip: 'data:image/webp;base64,UklGRqQAAABXRUJQVlA4IJgAAACwBACdASoYABAAPu1iqU2ppaOiMAgBMB2JQBOmUABwf2S1zV2oM5zRTJlf9NAAAP7FW514SZkvw9B/7Z3pE/Cp2z9HOXAIWs4op8A9YmKffJcEIRSZYWROhysqwmkC9IzVW4Kor4AnKC/xkUuidPvsnJ1u4jSFv9mrzdV9Hk9htym3l0KnNIOmlWydSITu3QobMFyGRsIAAA==', pos: '50% 35%' },
  { caption: 'Iris 和學生在鍵盤旁討論', src: about5, lqip: 'data:image/webp;base64,UklGRlIBAABXRUJQVlA4IEYBAADQBgCdASoYACQAPu1yrlMppqQipWmZMB2JQBadMXrcWnPbdaLC1OYL1cwDH+dYL9ZdlJDxE/7oXM2j6nJNUgAA/u2uaeToXehuebHFF/VEqwF9whHsGvNCW93TvNZubLuqI6uTW8iA1j6GSokNyq1S4UM9mnOnVHWiuPbkiwSQm2AoKsKf71vddWOI6nQhtSl5EJEICPe7i4NEEe18uQWnr7OM1YMNxgwRN6a1sdJROSJM5bfY/Rb7/0h5gKxmttkoAvwIh2B7ven5L+4KN3s/P96OmuLVpyiStSugdr7yv1fd6H9tHnjrciBBJc/toHK7HNNzD+f+lhHK61aMnneSPNyOanTp531Fz7o4S1fs9F2uUFrwG4CCYUY2Q3Wu0srP2+s+S/0mqOyQcY8iliZ3hvHN0I5hJviNQQH1RBSQlqECZrIAAA==', pos: '50% 26%' },
  { caption: 'Iris 與學生的合照', src: about6, lqip: 'data:image/webp;base64,UklGRpgAAABXRUJQVlA4IIwAAAAQBACdASoYABAAPu1iqU2ppaOiMAgBMB2JYgCdAYxE31eK/+rIGzbOOAD+3saRpnYCCP449z+kfXUij0F97r8P/ih3X7nsFAzhn/ht1Bytx//vmCZEvvZyZbxgkWic/A9fe0Hee2WdyFSIiaZmqxblEYSIP/XZfupheMqrPN3nB0vxMF4ZYTpeFAAAAA==', pos: '50% 40%' },
];
// Instagram Reels (Iris's own posts), newest first as given. `cover` is a SAMPLE studio photo: replace each with that reel's
// own cover image (Instagram doesn't let a website fetch thumbnails without an app review, so covers are stored here).
const REELS = ['Dc_LQRduKf0', 'DZXNjLMRvry', 'DQ6667yk1NP', 'DNDn0AkxO9b', 'DEVDWcaSplt', 'C9mI7YjxZ4a', 'C5fhPr9RICt', 'DXbgjVJyTd8']
  .map((code, k) => ({ code, cover: k === 0 ? { src: studioPhoto, lqip: STUDIO_LQIP } : EVENT_PHOTOS[(k - 1) % EVENT_PHOTOS.length] }));
/** photos for the 演唱與教學經歷 background strip (doubled in the markup so the drift can loop seamlessly) */
const CAREER_STRIP = [heroPhoto, EVENT_PHOTOS[2].src, studioPhoto, EVENT_PHOTOS[4].src, EVENT_PHOTOS[1].src, EVENT_PHOTOS[6].src];
/** 教會敬拜團歌手教學、團隊訓練 — in the order Iris gave */
const CHURCHES = ['浸信會懷恩堂', '中崙長老教會', '土城長老教會', '台北真理堂', '中和佳音堂', '蘆洲浸信會', 'A&S禮拜堂', 'The Hope', '永和禮拜堂', '高雄靈糧堂', '員林基督教醫院'];
/** 福音音樂與專輯錄音 — each credit can carry an MP3 (`src`). Until Iris sends the files the row shows 「試聽音檔準備中」. */
type Track = { label: string; desc: string; song: string; src?: string };
const TRACKS: Track[] = [
  { label: '入圍傳藝金曲獎《聖詩－永恆的讚美》', desc: '入圍傳藝金曲獎', song: '聖詩－永恆的讚美' },
  { label: '以斯拉敬拜《我只願一生》', desc: '以斯拉敬拜', song: '我只願一生' },
  { label: '矽谷生命河靈糧堂敬拜專輯《Shekina》', desc: '矽谷生命河靈糧堂敬拜專輯', song: 'Shekina' },
  { label: '天父的喜悅《擁抱我回家》歌曲錄製', desc: '天父的喜悅 · 歌曲錄製', song: '擁抱我回家' },
];
/** 演唱與教學經歷 numbers — counted from the bio above (Iris to confirm). Years since 2014 grow by themselves. */
const CAREER_STATS = [
  { n: new Date().getFullYear() - 2014, label: '年演唱與教學經驗' },
  { n: 10, label: '品牌廣告配樂與配唱' },
  { n: 4, label: '福音音樂機構專輯錄音' },
  { n: 4, label: '國內外大專院校錄取輔導' },
];
const IG_PROFILE = 'https://www.instagram.com/iamcheniris/';
const pics = (start: number) => EVENT_PHOTOS.map((_, i) => EVENT_PHOTOS[(start + i) % EVENT_PHOTOS.length]);
type LpEvent = { title: string; date: string; place: string; summary: string; photos: { caption: string; src?: string; lqip?: string }[] };
const SAMPLE_EVENTS: LpEvent[] = [
  { title: '秋季小型發表會', date: '2026/10/18（六）', place: '[場地名稱]', summary: '學生們第一次在親友面前完整演唱一首歌，從流行歌到音樂劇選曲，每個人都很勇敢。', photos: pics(2) },
  { title: '夏日聲樂工作坊', date: '2026/07/26（六）', place: 'Iris Studio A 教室', summary: '半天的呼吸與共鳴密集練習，最後大家一起合唱了一首歌。', photos: pics(1) },
];

const BENEFITS = [
  { icon: 'mic' as const, title: '把基礎打穩', text: '呼吸、發聲、音準和換聲區，一步一步練到身體記得。', note: '一對一 · 每堂 1 小時' },
  { icon: 'notes' as const, title: '唱你真正想唱的歌', text: '練習從你喜歡的歌開始設計，技巧直接用在歌裡。', note: '流行 · 音樂劇 · 古典' },
  { icon: 'phones' as const, title: '準備重要的舞台', text: '婚禮獻唱、比賽、試鏡前的密集練習，還有工作室發表會。', note: '可和一般課程一起安排' },
];

export function Landing() {
  // section-by-section scrolling (one section per screen) — only on the home page, and not for reduced motion
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('lp-snap');
    return () => document.documentElement.classList.remove('lp-snap');
  }, []);
  return (
    <div className="site lp">
      <SiteHeader home />

      {/* 1. Hero — a full-screen photo with the header, a big title and a caption on it (a dark gradient sits behind
          the text so it stays readable on any part of the photo). ScrollIntro fades the title + caption up when scrolling starts. */}
      <ScrollIntro>
        <section id="hero" className="lp-hero2" aria-labelledby="hero-t">
          <Photo caption="Iris 在舞台上演唱" src={heroPhoto} mobile={heroMobile} lqip={HERO_LQIP} eager />
          <div className="lp-hero2-scrim" aria-hidden="true" />
          <div className="lp-hero2-copy">
            <h1 className="lp-hero2-title" id="hero-t">找到屬於<br />你的聲音</h1>
            <p className="lp-hero2-cap">不是唱得更像別人，而是更自在地唱成自己。</p>
          </div>
        </section>
      </ScrollIntro>

      {/* 2. About — big 關於 Iris title (the word "Iris" is the studio logo itself), a slow 3-D photo carousel, then 2 short paragraphs */}
      <section id="about" className="lp-sec lp-about2" aria-labelledby="about-t">
        <h2 className="lp-about-h" id="about-t">
          <span className="lp-about-zh">關於</span><Logo className="lp-about-logo" /><span className="sr-only">Iris</span>
        </h2>
        {/* SAMPLE photos (max 6) — replace with Iris's own photos */}
        <AboutCarousel photos={ABOUT_PHOTOS} />
        <div className="lp-about-text">
          <h3 className="lp-h2">你好，我是 Iris Chen 陳文媛</h3>
          <p className="lp-p lp-role">全職音樂工作者／敬拜主領／歌唱教練，目前為全職歌唱教練。</p>
          <p className="lp-p">從小接受古典音樂訓練並於國立東華大學音樂學系主修鋼琴副修聲樂畢業後，現為歌唱教練及音樂工作者。曾在廣告錄音公司工作期間接觸音樂音效製作與配樂編曲，並為 HTC、ASUS、1028、NIKON、CANON、TOYOTA、MAZDA、KOSE、中國信託、uni water、寶礦力水得⋯等廣告製作配樂編曲、音效設計、配音及配唱。</p>
          <p className="lp-p">自 2014 年開始至今更多投入演唱及教學工作，曾參與矽谷生命河靈糧堂、以斯拉敬拜、歡讚音樂、Arise &amp; Shine⋯等福音音樂機構專輯錄音，並至台灣各地、中國大陸、馬來西亞、新加坡等世界各地演出。</p>
          <p className="lp-p">目前致力於歌唱訓練及教會敬拜歌手／合唱團培訓，曾輔導學生考取國立台灣師範大學表演藝術研究所、Bethel Conservatory of the Arts、AMPA - Academy of Music and Performing Arts、The Australian Institute of Music 等國內外大專院校。</p>
        </div>
      </section>

      {/* 2b. 演唱與教學經歷 — dark sage band with 4 big numbers (counted from Iris's bio; years update themselves) */}
      <section id="career" className="lp-sec lp-career" aria-labelledby="car-t">
        {/* background: a long strip of studio photos (decorative), slowly drifting; sage veil on top keeps the text readable */}
        <div className="lp-career-bg" aria-hidden="true">
          <div className="lp-career-strip">
            {[...CAREER_STRIP, ...CAREER_STRIP].map((src, i) => <img key={i} src={src} alt="" loading="lazy" decoding="async" />)}
          </div>
        </div>
        <div className="lp-career-in">
          <div className="lp-career-head">
            <div>
              <h2 className="lp-career-h" id="car-t">演唱與教學經歷</h2>
              <p className="lp-career-lead">自 2014 年起投入專業演唱與音樂教學工作，長期參與敬拜與福音音樂相關演出與培訓並擔任鋼琴與歌唱教師，教學經驗豐富。</p>
            </div>
            <a href="#reels" className="lp-career-more">看演出片段<Icon name="arrow" size={16} /></a>
          </div>
          <ul className="lp-stats">
            {CAREER_STATS.map((s) => (
              <li key={s.label}><span className="lp-stat-n">{s.n}<sup>+</sup></span><span className="lp-stat-l">{s.label}</span></li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3. 課程內容 — scroll story: the title sticks under the top bar; one lesson at a time,
          its lines fade out upward one by one as you scroll, then the next lesson's lines fade in. */}
      <LessonStory />

      {/* 4. 學生心得 — big centred title, a description, then one photo card per student (name · words · who they are) */}
      <section id="voices" className="lp-sec lp-voices" aria-labelledby="voi-t">
        <h2 className="lp-big-h lp-big-h-sage" id="voi-t">學生心得</h2>
        <p className="lp-lead">學生怎麼說</p>
        <ul className="lp-vcards">
          {SAMPLE_VOICES.map((v) => (
            <li key={v.name}>
              <figure className="lp-vcard">
                <Photo caption={`${v.name}的照片`} src={v.photo} lqip={v.lqip} />
                <figcaption>
                  <p className="lp-vname">{v.name}</p>
                  <blockquote className="lp-vquote">{v.quote}</blockquote>
                  <p className="lp-vmeta">{v.job} · {v.time}</p>
                </figcaption>
              </figure>
            </li>))}
        </ul>
      </section>

      {/* 4b. 福音音樂與專輯錄音 — album credits + a small audio player for the recordings */}
      <section id="albums" className="lp-sec lp-albums" aria-labelledby="alb-t">
        <h2 className="lp-big-h lp-big-h-sage" id="alb-t">福音音樂與專輯錄音</h2>
        <p className="lp-lead">參與多張福音音樂專輯錄音製作，包括：</p>
        <AlbumPlayer />
        <p className="lp-albums-with">曾與矽谷生命河靈糧堂、以斯拉敬拜音樂、歡讚音樂、Arise &amp; Shine 合作錄音</p>
      </section>

      {/* 4c. 教會敬拜團歌手教學、團隊訓練 — a typographic "name wall" (like a concert poster's credit block), not cards */}
      <section id="churches" className="lp-sec lp-churches" aria-labelledby="ch-t">
        <p className="ch-over">合作教會與機構</p>
        <h2 className="lp-big-h lp-big-h-sage" id="ch-t">教會敬拜團歌手教學<span className="ch-br">、</span>團隊訓練</h2>
        <p className="lp-lead">這些年，到各地教會陪敬拜團一起練唱</p>
        <ul className="ch-wall">
          {CHURCHES.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <p className="ch-count">共 {CHURCHES.length} 間教會與機構</p>
      </section>

      {/* 5. Instagram Reels — a row of 9:16 tiles; a tap plays the reel in a dialog on this page */}
      <section id="reels" className="lp-sec lp-reels" aria-labelledby="reel-t">
        <h2 className="lp-big-h lp-big-h-sage" id="reel-t">精彩片段</h2>
        {/* SAMPLE description — Iris will replace this text */}
        <p className="lp-lead">課堂、成果發表和學生的小小進步。<a href={IG_PROFILE} target="_blank" rel="noopener noreferrer" className="lp-reels-ig">在 Instagram 看更多<span className="sr-only">（另開新視窗）</span> ↗</a></p>
        <ReelRail />
      </section>

      {/* 6. Studio events */}
      <section id="events" className="lp-sec" aria-labelledby="evt-t">
        <p className="lp-over">Iris Studio Event</p>
        <h2 className="lp-h2" id="evt-t">工作室活動</h2>
        <div className="lp-events">{SAMPLE_EVENTS.map((ev) => <EventBlock key={ev.title} ev={ev} />)}</div>
      </section>

      {/* 7. Final CTA */}
      <section id="cta" className="lp-final" aria-labelledby="cta-t">
        <h2 className="lp-h2" id="cta-t">還不確定從哪裡開始？</h2>
        <p className="lp-sub">先聊聊你現在的聲音，和你想唱到哪裡。</p>
        <Link to="/consult" className="btn primary lp-btn" viewTransition>免費聊 15 分鐘</Link>
        <p className="lp-cap">沒有壓力，也不用先決定要不要上課。</p>
      </section>

      <SiteFooter />
    </div>
  );
}

/** One event: 1 featured photo + 2 thumbnails; the rest open with 查看更多照片. */
function EventBlock({ ev }: { ev: LpEvent }) {
  const [more, setMore] = useState(false);
  const id = `ev-more-${ev.title}`;
  const rest = ev.photos.slice(3);
  return (
    <article className="lp-event" aria-labelledby={`${id}-t`}>
      <div className="lp-ev-photos">
        <div className="lp-ev-main"><Photo {...ev.photos[0]} /></div>
        <div className="lp-ev-thumb"><Photo {...ev.photos[1]} /></div>
        <div className="lp-ev-thumb"><Photo {...ev.photos[2]} /></div>
      </div>
      {more && <div className="lp-ev-more" id={id}>{rest.map((p) => <div className="lp-ev-thumb" key={p.caption}><Photo {...p} /></div>)}</div>}
      <div className="lp-ev-text">
        <p className="lp-ev-meta">{ev.date} · {ev.place}</p>
        <h3 id={`${id}-t`}>{ev.title}</h3>
        <p>{ev.summary}</p>
        {rest.length > 0 && <button className="lp-textlink" aria-expanded={more} aria-controls={id} onClick={() => setMore(!more)}>{more ? '收起照片' : `查看更多照片（${rest.length}）`}</button>}
      </div>
    </article>
  );
}

/** Site top bar. 免費諮詢 is the primary action, 登入 the quiet secondary one. */
export function SiteHeader({ home }: { home?: boolean }) {
  // home: the bar sits on the hero photo (transparent, white) and turns into the solid bar once the photo has scrolled away
  const [solid, setSolid] = useState(!home);
  useEffect(() => {
    if (!home) return;
    const hero = document.getElementById('hero');
    const check = () => setSolid(!hero || hero.getBoundingClientRect().bottom <= 72);
    check();
    addEventListener('scroll', check, { passive: true }); addEventListener('resize', check);
    return () => { removeEventListener('scroll', check); removeEventListener('resize', check); };
  }, [home]);
  return (
    <header className={`topbar lp-bar${home ? ' lp-bar-home' : ''}${solid ? ' is-solid' : ' is-over'}`}>
      {home ? <a href="#hero" className="brand" aria-label="Iris 聲樂工作室 首頁"><Logo /><span>聲樂教練</span></a>
        : <Link to="/" className="brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition><Logo /><span>聲樂教練</span></Link>}
      <nav aria-label="頁面導覽">
        {home ? <><a href="#about">關於 Iris</a><a href="#benefits">課程內容</a><a href="#voices">學生心得</a><a href="#events">活動</a></>
          : <Link to="/" viewTransition>回首頁</Link>}
      </nav>
      <Link to="/login" className="lp-bar-login" viewTransition>登入</Link>
      <Link to="/consult" className="lp-bar-cta" viewTransition aria-current={home ? undefined : 'page'}>免費諮詢<Icon name="chev" size={16} /></Link>
    </header>
  );
}

/**
 * Site footer: brand + one line, then two link groups (服務資訊 · 隱私與權益), then © and the
 * personal-data contact. Quiet on purpose — it is reference material, not a call to action.
 */
const SOCIAL = [
  { name: 'Instagram', icon: 'instagram', url: 'https://www.instagram.com/iamcheniris/' },
  { name: 'Facebook', icon: 'facebook', url: 'https://www.facebook.com/Iamcheniris/' },
  { name: 'YouTube', icon: 'youtube', url: 'https://www.youtube.com/channel/UCOWU0qWYtGaD6Twe-lZ_pyQ' },
] as const;

export function SiteFooter() {
  return (
    <footer className="foot ft">
      <div className="ft-card">
        <div className="ft-top">
          <div>
            <p className="ft-brand"><Logo /><span className="sr-only">Iris Vocal Studio</span><span>聲樂工作室</span></p>
            <p className="ft-tag">陪你找到自己的聲音。</p>
          </div>
          {/* Iris's own accounts; open in a new tab so the site stays open */}
          <ul className="ft-social" aria-label="Iris 的社群帳號">
            {SOCIAL.map((x) => (
              <li key={x.name}><a href={x.url} target="_blank" rel="noopener noreferrer" aria-label={`${x.name}（另開新視窗）`} title={x.name}>
                <SocialIcon kind={x.icon} /></a></li>))}
          </ul>
        </div>
        <nav className="ft-cols" aria-label="服務與隱私資訊">
          <div><h2 className="ft-h">服務資訊</h2><ul>{FOOTER_LINKS.service.map((l) => <li key={l.to}><Link to={l.to} viewTransition>{l.label}</Link></li>)}</ul></div>
          <div><h2 className="ft-h">隱私與權益</h2><ul>{FOOTER_LINKS.privacy.map((l) => <li key={l.to}><Link to={l.to} viewTransition>{l.label}</Link></li>)}</ul></div>
        </nav>
        <p className="ft-small">© 2026 IRIS Studio. All rights reserved.</p>
        {/* no real address yet: shown as an open item instead of a made-up one */}
        <p className="ft-small">個人資料保護聯絡窗口：<span className="ft-todo">【待填：正式聯絡信箱】</span></p>
      </div>
    </footer>
  );
}

/** /consult: the free-consult form on its own page (moved off the home page). */
export function ConsultPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="site lp">
      <SiteHeader />
      <section id="consult" className="cs" aria-labelledby="con-t">
        <div className="cs-intro">
          <Link to="/" className="au-home cs-home" viewTransition><Icon name="back" size={16} />首頁</Link>
          <h1 className="lp-h1" id="con-t">先聊聊，再決定</h1>
          <ol className="cs-steps" aria-label="諮詢流程">
            <li><span aria-hidden="true">1</span>填寫需求</li>
            <li><span aria-hidden="true">2</span>免費聊 15 分鐘</li>
            <li><span aria-hidden="true">3</span>再決定要不要上課</li>
          </ol>
        </div>
        <ConsultForm />
      </section>
      <SiteFooter />
    </div>
  );
}

type ConsultTime = keyof typeof CONSULT_TIME_LABEL;
/** Feels like a short message to Iris: name, how to reach you, a rough time window, what's on your mind. */
function ConsultForm() {
  const send = useSendConsult();
  const [f, setF] = useState<{ name: string; contactType: 'line' | 'email'; contact: string; preferredTime: ConsultTime | null; topic: string }>(
    { name: '', contactType: 'line', contact: '', preferredTime: null, topic: '' });
  const [tried, setTried] = useState(false);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contact.trim());
  // LINE ID rule (LINE's own): 4–20 characters, lowercase letters, digits, dot, dash, underscore
  const lineOk = /^[a-z0-9._-]{4,20}$/.test(f.contact.trim());
  // check the contact field 600 ms after the user stops typing, not on every key press
  const [contactChecked, setContactChecked] = useState(false);
  useEffect(() => {
    setContactChecked(false);
    if (!f.contact.trim()) return;
    const t = window.setTimeout(() => setContactChecked(true), 600);
    return () => window.clearTimeout(t);
  }, [f.contact, f.contactType]);
  const errs = {
    name: !f.name.trim() ? '請填寫名字。' : '',
    contact: !f.contact.trim() ? (f.contactType === 'line' ? '請留下 LINE ID。' : '請留下 Email。') : f.contactType === 'email' && !emailOk ? '請填寫正確的 Email。'
      : f.contactType === 'line' && !lineOk ? 'LINE ID 是 4–20 個小寫英文、數字或 . - _' : '',
    preferredTime: !f.preferredTime ? '請選一個方便聯絡的時間。' : '',
  };
  // the button only wakes up once the 3 required answers are there (the email format is still checked on send)
  const filled = !!f.name.trim() && !!f.contact.trim() && !!f.preferredTime;
  // stay disabled while any field still has a validation error (e.g. a wrong Email / LINE ID format)
  const ready = filled && !Object.values(errs).some(Boolean);
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (!ready) return;
    if (Object.values(errs).some(Boolean)) return;
    send.mutate({ name: f.name.trim(), contactType: f.contactType, contact: f.contact.trim(), preferredTime: f.preferredTime!, topic: f.topic.trim() });
  };
  if (send.isSuccess) return (
    <div className="cs-card cs-sent" role="status">
      <span className="cs-sent-ico" aria-hidden="true"><Icon name="check" size={24} /></span>
      <h2>訊息已送出，謝謝你！</h2>
      <p>Iris 會在 1–2 天內用{f.contactType === 'line' ? ' LINE ' : ' Email '}聯絡你，約一個{CONSULT_TIME_LABEL[f.preferredTime!]}的時間聊聊。</p>
    </div>
  );
  const shown = (k: keyof typeof errs) => !!errs[k] && (tried || (k === 'contact' && contactChecked));
  const err = (k: keyof typeof errs) => (shown(k) ? <p className="field-error" id={`${k}-err`}>{errs[k]}</p> : null);
  const bad = (k: keyof typeof errs) => shown(k);
  return (
    <form className="cs-card" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="cn">名字<span className="au-req" aria-hidden="true">*</span><span className="sr-only">（必填）</span></label>
        <input id="cn" className="input" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="怎麼稱呼你？" aria-invalid={bad('name')} aria-describedby="name-err" />{err('name')}</div>

      <fieldset className="field cs-fs"><legend>聯絡方式<span className="au-req" aria-hidden="true">*</span><span className="sr-only">（必填）</span></legend>
        <div className={'cs-combo' + (bad('contact') ? ' is-bad' : '')}>
        <div className="cs-combo-top">
        <div className="cs-seg" role="radiogroup" aria-label="聯絡方式">
          {(['line', 'email'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={f.contactType === t} onClick={() => setF({ ...f, contactType: t, contact: '' })}>{t === 'line' ? 'LINE' : 'Email'}</button>))}
        </div>
        {f.contactType === 'line' && <LineIdHelp />}
        </div>
        <label className="sr-only" htmlFor="cc">{f.contactType === 'line' ? 'LINE ID' : 'Email'}</label>
        <input id="cc" className="input" key={f.contactType}
          type={f.contactType === 'email' ? 'email' : 'text'} inputMode={f.contactType === 'email' ? 'email' : 'text'}
          autoComplete={f.contactType === 'email' ? 'email' : 'off'} autoCapitalize="off" spellCheck={false}
          placeholder={f.contactType === 'line' ? '你的 LINE ID' : 'name@example.com'}
          value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} aria-invalid={bad('contact')} aria-describedby="contact-err" />
        </div>{err('contact')}
      </fieldset>

      <fieldset className="field cs-fs"><legend>方便聯絡的時間<span className="au-req" aria-hidden="true">*</span><span className="sr-only">（必填）</span></legend>
        <div className="cs-chips" role="radiogroup" aria-label="方便聯絡的時間" aria-describedby="preferredTime-err">
          {(Object.keys(CONSULT_TIME_LABEL) as ConsultTime[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={f.preferredTime === k} onClick={() => setF({ ...f, preferredTime: k })}>{CONSULT_TIME_LABEL[k]}</button>))}
        </div>{err('preferredTime')}
      </fieldset>

      <div className="field"><label htmlFor="cw">想聊什麼？<span className="cs-opt">（選填）</span></label>
        <textarea id="cw" className="input" rows={3} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="例如：想把高音唱穩、準備婚禮獻唱" /></div>

      {send.isError && <div className="notice error" role="alert"><Icon name="info" /><span>{(send.error as Error).message}</span></div>}
      <div className="cs-submit">
        <button className="btn primary lp-btn cs-btn" disabled={!ready || send.isPending} aria-describedby={ready ? undefined : 'cs-need'}>
          {send.isPending ? '送出中…' : ready ? '和 Iris 聊聊' : filled ? '請確認填寫的內容' : '先填寫資訊喔！'}</button>
        {!ready && <p className="sr-only" id="cs-need">{filled ? '有欄位格式不正確，請修正後再送出。' : '請先填寫名字、聯絡方式和方便聯絡的時間。'}</p>}
        <p className="cs-reassure">免費 15 分鐘・沒有壓力，不需要先決定是否上課</p>
        <p className="cs-privacy">聯絡資料只會用於這次諮詢。</p>
      </div>
    </form>
  );
}

/**
 * Hero intro (progressive enhancement).
 * The photo stays pinned (sticky stage) for a short stretch of scrolling. As soon as scrolling starts, the title and then
 * the caption fade out upwards — time-based CSS transitions (title 1.4 s, caption 0.8 s later, ≈ 2.4 s in total) so the motion
 * is calm and the same however fast someone scrolls. Back at the top they come back. The photo itself zooms out slightly with the scroll.
 * Without JS (pre-rendered HTML) or with reduced motion: a normal full-screen hero, text always visible.
 */
function ScrollIntro({ children }: { children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const decide = () => setOn(!mq.matches);
    decide();
    mq.addEventListener('change', decide);
    return () => mq.removeEventListener('change', decide);
  }, []);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    // the hero slides under the sticky header: pull it up by the header's real height
    const hd = document.querySelector<HTMLElement>('.site .lp-bar');
    const setHead = () => hd && el.style.setProperty('--lp-head', `${hd.offsetTop + hd.offsetHeight}px`);
    setHead();
    if (!on) { addEventListener('resize', setHead); return () => removeEventListener('resize', setHead); }
    let cur = -1, target = 0, raf = 0, gone = false;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const read = () => {
      const r = el.getBoundingClientRect();
      target = clamp(-r.top / Math.max(1, r.height - innerHeight));
      const g = scrollY > 24; // the copy leaves as soon as the visitor starts scrolling, and returns at the very top
      if (g !== gone) { gone = g; el.classList.toggle('is-gone', g); }
    };
    const tick = () => {
      raf = 0;
      cur = cur < 0 ? target : cur + (target - cur) * .18; // eased towards the real position → smooth with wheel steps
      if (Math.abs(target - cur) < .0008) cur = target;
      el.style.setProperty('--p', cur.toFixed(4));
      if (cur !== target) raf = requestAnimationFrame(tick);
    };
    const onScroll = () => { read(); if (!raf) raf = requestAnimationFrame(tick); };
    const onResize = () => { setHead(); onScroll(); };
    read(); tick();
    addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onResize);
    return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); cancelAnimationFrame(raf); el.classList.remove('is-gone'); };
  }, [on]);
  return (
    <div ref={wrap} className={`lp-intro${on ? ' is-on' : ''}`}>
      <div className="lp-stage">
        {children}
        <span className="lp-scrollhint" aria-hidden="true"><span>向下滑動</span><Icon name="chevDown" size={18} /></span>
      </div>
    </div>
  );
}

/**
 * 關於 Iris carousel — 3 cards in view: the current photo flat in the middle, its neighbours turned away in 3-D at the edges.
 * It moves on by itself every 3 s; there are no controls. It waits while the pointer or keyboard focus is on it,
 * while it is off screen or the tab is hidden, and keeps the time already passed (a paused photo doesn't restart at 0 s).
 * Reduced motion: no autoplay, no 3-D movement.
 */
const AC_MS = 3_000;
function AboutCarousel({ photos }: { photos: { caption: string; src: string; lqip?: string; pos?: string }[] }) {
  const n = photos.length;
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  const [inView, setInView] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const left = useRef(AC_MS); // time still to wait for the current photo
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const f = () => setReduced(mq.matches); f(); mq.addEventListener('change', f);
    const vis = () => setTabHidden(document.hidden); document.addEventListener('visibilitychange', vis);
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: .35 });
    if (box.current) io.observe(box.current);
    return () => { mq.removeEventListener('change', f); document.removeEventListener('visibilitychange', vis); io.disconnect(); };
  }, []);
  const running = !hold && inView && !tabHidden && !reduced && n > 1;
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    let fired = false;
    const t = setTimeout(() => { fired = true; left.current = AC_MS; setI((x) => (x + 1) % n); }, left.current);
    // paused (or re-rendered) before the time was up: remember what was left
    return () => { clearTimeout(t); if (!fired) left.current = Math.max(0, left.current - (performance.now() - start)); };
  }, [running, i, n]);
  const rel = (k: number) => { const o = (k - i + n) % n; return o > n / 2 ? o - n : o; }; // −2 … 3 around the current photo
  return (
    <div className={`ac${reduced ? ' is-still' : ''}`} ref={box} role="region" aria-roledescription="carousel" aria-label="Iris 與工作室的照片"
      onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
      <div className="ac-track">
        {photos.map((p, k) => {
          const r = rel(k);
          return (
            <div key={k} className="ac-slide" data-pos={Math.abs(r) <= 1 ? r : r < 0 ? 'out-l' : 'out-r'}
              role="group" aria-roledescription="slide" aria-label={`${k + 1} / ${n}`} aria-hidden={r !== 0}>
              <Photo caption={p.caption} src={p.src} lqip={p.lqip} style={p.pos ? ({ '--pos': p.pos } as React.CSSProperties) : undefined} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 課程內容 icons — drawn for this site (64 × 64): white fill + a thin dark outline, no box behind them,
 * so they sit straight on the page background. Decorative (the title next to each says what it is).
 */
function LessonIcon({ kind }: { kind: 'mic' | 'notes' | 'phones' }) {
  const common = { viewBox: '0 0 64 64', fill: '#FFFFFF', stroke: '#1F2A24', strokeWidth: 1.8, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const, className: 'lp-licon', 'aria-hidden': true };
  if (kind === 'mic') return (
    <svg {...common}>
      <g transform="rotate(32 30 30)">
        <path d="M23 26 H37 L34.2 50 Q30 53.5 25.8 50 Z" />
        <rect x="28.4" y="31" width="3.2" height="6" rx="1" />
        <path d="M28 52 V58" fill="none" />
        <circle cx="30" cy="16" r="11" />
        <path d="M19.6 19.4 Q30 23.6 40.4 19.4" fill="none" />
        <path d="M20.4 21.6 Q30 26 39.6 21.6" fill="none" />
      </g>
      <path d="M45 30 V49" />
      <path d="M45 30 Q46 36 52 38 Q56 39.5 55 45 Q53 40.5 45 39.5 Z" />
      <ellipse cx="41.2" cy="50.2" rx="4.6" ry="3.6" transform="rotate(-20 41.2 50.2)" />
    </svg>
  );
  if (kind === 'notes') return (
    <svg {...common}>
      <path d="M30.6 12 H34.4 V46 H30.6 Z" />
      <path d="M34.4 12 Q36 22 42 25 Q47 28 45.5 35 Q43 29 34.4 27.5 Z" />
      <ellipse cx="27" cy="47" rx="8" ry="6" transform="rotate(-22 27 47)" />
      <path d="M13 22 H15.6 V40 H13 Z" />
      <path d="M15.6 22 Q16.6 27 20 28.6 Q22.4 30 21.6 34 Q20 30.6 15.6 29.6 Z" />
      <ellipse cx="10.6" cy="40.6" rx="4.4" ry="3.3" transform="rotate(-22 10.6 40.6)" />
      <path d="M51 38 H53.4 V53 H51 Z" />
      <path d="M53.4 38 Q54.2 42 57 43.4 Q59 44.6 58.4 48 Q57 45 53.4 44.2 Z" />
      <ellipse cx="48.8" cy="53.4" rx="4" ry="3" transform="rotate(-22 48.8 53.4)" />
      <path d="M42.6 12.1 L43.6 6.2 M47.4 14.6 L51.6 10.4 M49.9 19.4 L55.8 18.4" fill="none" strokeWidth={2.6} />
    </svg>
  );
  return (
    <svg {...common}>
      <path d="M9 40 V33 C9 19.5 19.5 9 32 9 C44.5 9 55 19.5 55 33 V40 H50.4 V33 C50.4 22 42 13.6 32 13.6 C22 13.6 13.6 22 13.6 33 V40 Z" />
      <rect x="6" y="36" width="9" height="18" rx="3.5" />
      <rect x="13.4" y="33" width="9" height="23" rx="3.8" />
      <rect x="49" y="36" width="9" height="18" rx="3.5" />
      <rect x="41.6" y="33" width="9" height="23" rx="3.8" />
    </svg>
  );
}

/** Social glyphs drawn for the footer (24 × 24, currentColor) so they read clearly inside the round buttons. */
function SocialIcon({ kind }: { kind: 'instagram' | 'facebook' | 'youtube' }) {
  if (kind === 'instagram') return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
  if (kind === 'facebook') return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M13.6 21v-8h2.7l.4-3.2h-3.1V7.8c0-.9.3-1.6 1.6-1.6h1.7V3.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.3H7.4V13h2.8v8h3.4z" />
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" fill="currentColor" /><path d="M10 9.2v5.6l4.8-2.8z" fill="#203129" />
    </svg>
  );
}

/**
 * Reels rail. Each tile is only a cover + play button ("facade"): nothing from Instagram loads until someone taps one.
 * Why: 8 Instagram embeds would add several MB and Meta's cookies to every visit; this way only people who want to watch
 * load one, and the Cookie 政策 can say so. The tap opens a dialog with Instagram's official embed, which plays right here
 * (Instagram's own player, unmodified, so its terms are respected). If the embed can't load, the link opens Instagram.
 */
function ReelRail() {
  const rail = useRef<HTMLUListElement>(null);
  // list comes from 更多 › IG Reels (max 8, Iris's order); the built-in list shows until it loads (and in the pre-rendered page)
  const live = useReels();
  const items = (live.data ?? REELS.map((r, k) => ({ id: r.code, title: '', url: `https://www.instagram.com/reel/${r.code}/`, coverUrl: null, coverLqip: null, sortOrder: k + 1 })))
    .slice(0, 8)
    .map((r, k) => ({ ...r, code: igCode(r.url), cover: r.coverUrl ? { src: r.coverUrl, lqip: r.coverLqip ?? undefined } : REELS[k % REELS.length].cover }));
  const [open, setOpen] = useState<number | null>(null);
  const [from, setFrom] = useState<DOMRect | null>(null); // where the tapped tile was, so the player can fly out of it
  const step = (d: number) => {
    const el = rail.current; if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: d * el.clientWidth * .8, behavior: reduce ? 'auto' : 'smooth' });
  };
  return (
    <div className="rl">
      <div className="rl-nav">
        <button type="button" className="rl-arrow" aria-label="往左看更多片段" onClick={() => step(-1)}><Icon name="back" size={18} /></button>
        <button type="button" className="rl-arrow" aria-label="往右看更多片段" onClick={() => step(1)}><Icon name="chev" size={18} /></button>
      </div>
      <ul className="rl-rail" ref={rail} aria-label="Instagram Reels，可左右滑動">
        {items.map((r, k) => (
          <li key={r.id}>
            <button type="button" className="rl-tile" onClick={(e) => { setFrom(e.currentTarget.getBoundingClientRect()); setOpen(k); }} aria-label={`播放 Reel：${r.title || `第 ${k + 1} 支`}（Instagram）`}>
              <Photo caption="" src={r.cover.src} lqip={r.cover.lqip} />
              <span className="rl-play" aria-hidden="true"><Icon name="play" size={22} weight="fill" /></span>
              <span className="rl-tag" aria-hidden="true"><SocialIcon kind="instagram" /> Reel</span>
            </button>
          </li>))}
      </ul>
      {open !== null && items[open] && <ReelDialog code={items[open].code} n={open + 1} from={from} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Reel player. Opens with a "pop out": the box starts exactly where the tapped tile was, squashes a little, then flies
 *  to the centre while growing (with a small overshoot). Closing plays it back into the tile. Background: blur → black. */
function ReelDialog({ code, n, from, onClose }: { code: string; n: number; from: DOMRect | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // transform that puts the (final-size) box on top of the tile
  const fromTransform = () => {
    const el = box.current; if (!el || !from) return null;
    const r = el.getBoundingClientRect();
    const sx = from.width / r.width, sy = from.height / r.height;
    const dx = from.left + from.width / 2 - (r.left + r.width / 2), dy = from.top + from.height / 2 - (r.top + r.height / 2);
    return { dx, dy, sx, sy };
  };
  useEffect(() => {
    const d = ref.current; if (!d) return;
    openModal(d);
    document.documentElement.classList.add('modal-open');
    const t = fromTransform();
    if (t && !reduce()) {
      box.current!.animate([
        { transform: `translate(${t.dx}px,${t.dy}px) scale(${t.sx},${t.sy})`, borderRadius: '16px', opacity: 0.9 },
        { transform: `translate(${t.dx}px,${t.dy}px) scale(${t.sx * 0.9},${t.sy * 0.9})`, offset: 0.16 },           // squash
        { transform: `translate(${t.dx * 0.15}px,${t.dy * 0.15}px) scale(1.04)`, opacity: 1, offset: 0.78 },        // fly + overshoot
        { transform: 'none', borderRadius: '22px' },
      ], { duration: 620, easing: 'cubic-bezier(.3,.7,.2,1)' });
      // page goes: clear → blurred → dark, in step with the box flying out
      shade.current?.animate([
        { backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' },
        { backgroundColor: 'rgba(0,0,0,.3)', backdropFilter: 'blur(12px)', offset: 0.45 },
        { backgroundColor: 'rgba(0,0,0,.86)', backdropFilter: 'blur(14px)' },
      ], { duration: 620, easing: 'ease-out' });
    }
    return () => document.documentElement.classList.remove('modal-open');
  }, []);
  // shared close motion (lib/modalMotion): swell → shrink back into the Reel tile it came from, fading out
  const close = () => {
    if (closing.current) return; closing.current = true;
    closeModal(ref.current, { box: box.current, shade: shade.current, from });
  };
  const url = `https://www.instagram.com/reel/${code}/`;
  return (
    <dialog ref={ref} className="rl-dlg" aria-label={`第 ${n} 支 Reel`} onClose={onClose}
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="rl-shade" ref={shade} aria-hidden="true" />
      <div className="rl-box" ref={box}>
        <button type="button" className="rl-x" aria-label="關閉" onClick={close}><Icon name="x" size={20} /></button>
        <iframe className="rl-frame" src={`${url}embed/`} title={`Instagram Reel ${n}`} allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
          allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        <p className="rl-note">影片由 Instagram 提供。看不到影片？<a href={url} target="_blank" rel="noopener noreferrer">在 Instagram 開啟<span className="sr-only">（另開新視窗）</span> ↗</a></p>
      </div>
    </dialog>
  );
}

/** Small (i) button: click, or hover 3 s, opens a dialog explaining where to find the LINE ID. */
function LineIdHelp() {
  const ref = useRef<HTMLDialogElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const open = () => { window.clearTimeout(timer.current); if (!ref.current?.open) openModal(ref.current); };
  const close = () => closeModal(ref.current, { box: ref.current }); // the dialog itself is the panel
  const cancel = () => window.clearTimeout(timer.current);
  useEffect(() => cancel, []);
  return (
    <>
      <button type="button" className="cs-info" aria-label="怎麼找到 LINE ID？" aria-haspopup="dialog"
        onClick={open} onMouseEnter={() => { cancel(); timer.current = window.setTimeout(open, 3000); }} onMouseLeave={cancel}>
        <Icon name="info" size={16} /><span>怎麼找 LINE ID？</span>
      </button>
      <dialog ref={ref} className="cs-help" aria-labelledby="lid-t" onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <h2 id="lid-t">怎麼找到 LINE ID？</h2>
        <p>LINE ID 在 LINE App 裡：</p>
        <ol><li>打開 LINE，進入首頁（Home）</li><li>點右上角的齒輪 ⚙︎</li><li>選有大頭貼的「個人檔案」（Profile）</li><li>找到「ID」欄位，就是你的 LINE ID</li></ol>
        <button type="button" className="btn primary lp-btn" onClick={close}>知道了</button>
      </dialog>
    </>
  );
}

/** 課程內容 scroll story. Section is N screens tall; a sticky stage holds the title + the lesson area.
 *  Scroll progress picks the lesson; each line (number, icon, title, text, note) has its own fade timing,
 *  so lines leave upward one after another. Without JS / with reduced motion it is a plain stacked list. */
function LessonStory() {
  const ref = useRef<HTMLElement>(null);
  const [story, setStory] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setStory(true);
  }, []);
  useEffect(() => {
    const sec = ref.current;
    if (!story || !sec) return;
    const items = Array.from(sec.querySelectorAll<HTMLElement>('.ls-card'));
    const N = items.length;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    let raf = 0;
    const paint = () => {
      raf = 0;
      const r = sec.getBoundingClientRect();
      // The stage is only as tall as its content and sticks centred in the screen (never under the top bar),
      // so it arrives right after the section above and the next section follows right after it.
      const stage = sec.querySelector<HTMLElement>('.ls-stage')!;
      const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lp-head')) || 64;
      const st = Math.max(head + 8, (window.innerHeight - stage.offsetHeight) / 2);
      sec.style.setProperty('--st', `${st}px`);
      const span = r.height - stage.offsetHeight;           // how far the stage stays pinned
      const p = span > 0 ? Math.max(0, Math.min(0.9999, (st - r.top) / span)) : 0;
      const pos = p * N;                                     // 0..N — card c is "on stage" while c ≤ pos < c+1
      items.forEach((card, c) => {
        const l = pos - c;                                   // −∞..∞, 0..1 = this card's own screen
        const lines = Array.from(card.children) as HTMLElement[];
        let any = false;
        lines.forEach((el, k) => {
          const s = k * 0.06;
          const fin = c === 0 ? 1 : clamp((l + 0.18 - s) / 0.16);     // fade in (first card starts visible)
          const fout = c === N - 1 ? 0 : clamp((l - 0.62 - s) / 0.16); // fade out upward (last card stays)
          const o = Math.min(fin, 1 - fout);
          if (o > 0.001) any = true;
          el.style.opacity = String(o);
          el.style.transform = `translateY(${((1 - fin) * 28 - fout * 28).toFixed(1)}px)`;
        });
        card.style.visibility = any ? 'visible' : 'hidden';
        card.setAttribute('aria-hidden', String(!(l >= 0 && l < 1)));
      });
      const dot = sec.querySelectorAll<HTMLElement>('.ls-dots i');
      dot.forEach((d, i) => d.classList.toggle('on', i === Math.min(N - 1, Math.floor(pos))));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, [story]);
  return (
    <section id="benefits" ref={ref} className={`lp-sec lp-lessons ls${story ? ' is-story' : ''}`} aria-labelledby="ben-t" style={{ '--n': BENEFITS.length } as React.CSSProperties}>
      <div className="ls-stage">
        <div className="ls-head">
          <h2 className="lp-big-h" id="ben-t">課程內容</h2>
          {/* SAMPLE description — Iris will replace this text */}
          <p className="lp-lead">Iris 可以幫你什麼</p>
        </div>
        <ul className="ls-cards">
          {BENEFITS.map((b, i) => (
            <li key={b.title} className="ls-card">
              <span className="lp-stack-n" aria-hidden="true">{String(i + 1).padStart(2, '0')} / {String(BENEFITS.length).padStart(2, '0')}</span>
              <span className="ls-ic"><LessonIcon kind={b.icon} /></span>
              <h3>{b.title}</h3>
              <p>{b.text}</p>
              <small>{b.note}</small>
            </li>))}
        </ul>
        {story && <div className="ls-dots" aria-hidden="true">{BENEFITS.map((b) => <i key={b.title} />)}</div>}
      </div>
    </section>
  );
}

const mmss = (t: number) => (Number.isFinite(t) ? `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '--:--');
/** Small audio player: ‹‹ prev · play/pause · next ››, a seek bar with 00:00 / total, and the track list.
 *  One <audio> element; the browser streams the MP3 (preload="metadata" only reads the length). */
function AlbumPlayer() {
  const audio = useRef<HTMLAudioElement>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(NaN);
  const tr = TRACKS[i];
  const has = !!tr.src;
  const listRef = useRef<HTMLOListElement>(null);
  const [bar, setBar] = useState({ show: false, top: 0, h: 100 });
  const syncBar = () => {
    const el = listRef.current; if (!el) return;
    const show = el.scrollHeight > el.clientHeight + 1;
    const h = (el.clientHeight / el.scrollHeight) * 100;
    const top = show ? (el.scrollTop / (el.scrollHeight - el.clientHeight)) * (100 - h) : 0;
    setBar({ show, top, h });
  };
  useEffect(() => {
    syncBar();
    const el = listRef.current; if (!el) return;
    const ro = new ResizeObserver(syncBar); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const go = (k: number, autoplay = playing) => {
    const n = (k + TRACKS.length) % TRACKS.length;
    setI(n); setT(0); setDur(NaN);
    window.setTimeout(() => { const a = audio.current; if (a && TRACKS[n].src && autoplay) a.play().catch(() => setPlaying(false)); else setPlaying(false); }, 0);
  };
  const toggle = () => {
    const a = audio.current; if (!a || !has) return;
    if (a.paused) a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); else { a.pause(); setPlaying(false); }
  };
  return (
    <div className="ap" role="region" aria-label="專輯試聽">
      <audio ref={audio} src={tr.src} preload="metadata" onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => (i < TRACKS.length - 1 ? go(i + 1, true) : setPlaying(false))} />
      <div className="ap-now" aria-live="polite">
        <p className="ap-album">{tr.desc}</p>
        <p className="ap-song">{tr.song}</p>
        {!has && <p className="ap-soon">試聽音檔準備中</p>}
      </div>
      <div className="ap-ctrl">
        <button type="button" className="ap-btn" onClick={() => go(i - 1)} aria-label="上一首"><Icon name="skipBack" size={22} weight="fill" /></button>
        <button type="button" className="ap-btn ap-play" onClick={toggle} disabled={!has} aria-label={playing ? '暫停' : '播放'}><Icon name={playing ? 'pause' : 'play'} size={26} weight="fill" /></button>
        <button type="button" className="ap-btn" onClick={() => go(i + 1)} aria-label="下一首"><Icon name="skipFwd" size={22} weight="fill" /></button>
      </div>
      <div className="ap-time">
        <input type="range" min={0} max={Number.isFinite(dur) ? dur : 0} step={0.1} value={Math.min(t, Number.isFinite(dur) ? dur : 0)} disabled={!has || !Number.isFinite(dur)}
          aria-label="播放進度" aria-valuetext={`${mmss(t)} / ${mmss(dur)}`}
          style={{ '--fill': `${Number.isFinite(dur) && dur > 0 ? (t / dur) * 100 : 0}%` } as React.CSSProperties}
          onChange={(e) => { const a = audio.current; if (a) { a.currentTime = Number(e.target.value); setT(a.currentTime); } }} />
        <span className="ap-clock">{mmss(t)} / {mmss(has ? dur : NaN)}</span>
      </div>
      {/* track list: shows ~2½ rows, the rest scrolls. A thin always-visible bar on the right says "there is more"
          (phones hide native scrollbars, so this one is drawn by us and follows the list's scroll position). */}
      <div className="ap-list-wrap">
      <ol className="ap-list" ref={listRef} onScroll={syncBar}>
        {TRACKS.map((x, k) => (
          <li key={x.label}>
            <button type="button" className={k === i ? 'on' : ''} aria-current={k === i ? 'true' : undefined} onClick={() => go(k, k === i ? playing : !!x.src)}>
              <span className="ap-n" aria-hidden="true">{k === i && playing ? <Icon name="music" size={16} /> : String(k + 1).padStart(2, '0')}</span>
              <span className="ap-li">{x.label}</span>
            </button>
          </li>))}
      </ol>
      {bar.show && <div className="ap-bar" aria-hidden="true"><i style={{ top: `${bar.top}%`, height: `${bar.h}%` }} /></div>}
      </div>
    </div>
  );
}

/** shortcode from an Instagram link: /reel/ABC/, /reels/ABC/ or /p/ABC/ → ABC */
const igCode = (url: string) => url.match(/instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/)?.[1] ?? '';
