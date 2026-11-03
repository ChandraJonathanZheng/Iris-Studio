import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { Photo } from '../components/ui';
import { studioToday } from '../lib/date';
import { useSendConsult } from '../lib/queries';

/**
 * Public landing page. It is the same for every visitor, so `npm run build` pre-renders it to static HTML (#7):
 * the text is visible before any JavaScript runs, which helps first paint and search engines.
 * Bracketed text = placeholders until Iris provides real content (and real, consented testimonials).
 */
export function Landing() {
  return (
    <div className="site">
      <header className="topbar">
        <a href="#hero" className="brand" aria-label="Iris 聲樂工作室 首頁"><b>IRIS</b><span>聲樂教練</span></a>
        <nav aria-label="頁面導覽"><a href="#about">關於 Iris</a><a href="#lessons">課程內容</a><a href="#voices">學生心得</a><a href="#consult">免費諮詢</a></nav>
        <Link to="/login" className="btn primary" viewTransition>學生登入</Link>
      </header>

      <section id="hero" className="hero" aria-labelledby="hero-t">
        <Photo caption="照片：Iris 在教室或舞台上" />
        <div className="hero-card">
          <p className="display">Iris Studio</p>
          <h1 className="h1" id="hero-t">找到你最自在的聲音</h1>
          <p className="lead">一對一聲樂課，從呼吸、發聲到舞台表現，用適合你的步調慢慢進步。</p>
          <div className="row" style={{ flexWrap: 'wrap' }}><a href="#consult" className="btn primary">預約免費諮詢 <Icon name="arrow" size={18} /></a><a href="#lessons" className="btn secondary">看課程內容</a></div>
        </div>
      </section>

      <section id="about" className="section" aria-labelledby="about-t"><div className="wrap grid2">
        <Photo caption="照片：Iris 個人照" style={{ aspectRatio: '4 / 5' }} />
        <div className="stack g4">
          <p className="overline">關於 Iris</p>
          <h2 className="h1" id="about-t">你好，我是 Iris</h2>
          <p className="lead">[自我介紹：學習背景、教學年資、擅長的曲風。2–3 句，用 Iris 自己的話寫。]</p>
          <p className="lead">[教學理念：例如「每個人的聲音都不一樣，我會先聽你唱，再決定從哪裡開始。」]</p>
          <div className="facts"><div><b>[N] 年</b><span className="caption">教學經驗</span></div><div><b>1 對 1</b><span className="caption">每堂 45 分鐘</span></div><div><b>[曲風]</b><span className="caption">流行 · 音樂劇 · 古典</span></div></div>
        </div>
      </div></section>

      <section id="lessons" className="panel section" aria-labelledby="les-t"><div className="wrap stack" style={{ gap: 32 }}>
        <div className="stack g2"><p className="overline">課程內容</p><h2 className="h1" id="les-t">Iris 可以幫你什麼</h2></div>
        <div className="grid3">
          <article className="card"><span className="ico"><Icon name="mic" /></span><h3 className="h3">一對一聲樂課</h3>
            <ul className="dots"><li>呼吸與發聲基礎</li><li>音準、音域、換聲區</li><li>依照你想唱的歌設計練習</li></ul>
            <p className="caption">每堂 45 分鐘 · 4 堂 NT$ 3,200 · 8 堂 NT$ 6,200</p></article>
          <article className="card"><span className="ico"><Icon name="music" /></span><h3 className="h3">表演與舞台準備</h3>
            <ul className="dots"><li>婚禮、比賽、試鏡前的密集練習</li><li>舞台表情與麥克風技巧</li><li>工作室成果發表會</li></ul>
            <p className="caption">可以和一般課程一起安排</p></article>
          <article className="card"><span className="ico"><Icon name="calendar" /></span><h3 className="h3">線上預約與管理</h3>
            <ul className="dots"><li>用 LINE 登入，自己選時間</li><li>隨時查看剩餘堂數</li><li>上課前 24 小時取消可退回堂數</li></ul>
            <p className="caption">不用再一直私訊確認時間</p></article>
        </div>
      </div></section>

      <section id="voices" className="section" aria-labelledby="voi-t"><div className="wrap stack" style={{ gap: 32 }}>
        <div className="stack g2"><p className="overline">學生心得</p><h2 className="h1" id="voi-t">學生怎麼說</h2><p className="caption">[請放真實學生的心得，並先取得本人同意。]</p></div>
        <div className="grid3">
          {[['[學生心得 1：上課前的困擾 → 現在的改變，1–2 句。]', '[學習多久 · 例如：上班族，學了 6 個月]'], ['[學生心得 2：例如準備婚禮或比賽的經驗。]', '[學習多久]'], ['[學生心得 3：例如家長替孩子寫的心得。]', '[學習多久]']].map(([q, m], i) => (
            <figure className="card" style={{ margin: 0 }} key={i}><blockquote style={{ margin: 0 }}>{q}</blockquote>
              <figcaption className="row"><span className="avatar" aria-hidden="true" /><span className="stack g1"><span className="t">[學生名字或暱稱]</span><span className="caption">{m}</span></span></figcaption></figure>
          ))}
        </div>
      </div></section>

      <section id="consult" className="panel section" aria-labelledby="con-t"><div className="wrap grid2" style={{ alignItems: 'start' }}>
        <div className="stack g4">
          <p className="overline">免費諮詢</p>
          <h2 className="h1" id="con-t">先聊聊，再決定</h2>
          <p className="lead">留下聯絡方式，Iris 會在 1–2 天內用 LINE 或 Email 跟你約 15 分鐘的免費諮詢。</p>
          <ol className="steps"><li><span><b>填寫表單</b><br /><span className="caption">告訴 Iris 你想練什麼</span></span></li><li><span><b>免費諮詢 15 分鐘</b><br /><span className="caption">聽聽你的聲音，討論目標</span></span></li><li><span><b>用 LINE 登入開始上課</b><br /><span className="caption">購買堂數後自己選時間預約</span></span></li></ol>
        </div>
        <ConsultForm />
      </div></section>

      <footer className="foot">
        <p className="row" style={{ margin: 0 }}><b style={{ letterSpacing: '.24em', fontWeight: 400, fontSize: 20 }}>IRIS</b><span className="overline">聲樂工作室</span></p>
        <p className="caption">[地址] · LINE [@官方帳號] · [Email]</p>
        <p className="caption">已經是學生了？ <Link to="/login">登入</Link></p>
      </footer>
    </div>
  );
}

function ConsultForm() {
  const send = useSendConsult();
  const [f, setF] = useState({ name: '', contact: '', preferredDate: '', topic: '' });
  const [tried, setTried] = useState(false);
  const missing = { name: !f.name.trim(), contact: !f.contact.trim(), preferredDate: !f.preferredDate };
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (missing.name || missing.contact || missing.preferredDate) return;
    send.mutate(f);
  };
  if (send.isSuccess) return (
    <div className="card" style={{ padding: 32 }}><div className="notice" role="status"><span className="ico" style={{ background: 'var(--sage-700)', color: '#fff' }}><Icon name="check" /></span>
      <span><b>已送出，謝謝你！</b><br />Iris 會在 1–2 天內聯絡你。</span></div></div>
  );
  const err = (k: keyof typeof missing, text: string) => tried && missing[k] ? <p className="field-error" id={`${k}-err`}>{text}</p> : null;
  return (
    <form className="card" style={{ padding: 32 }} onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="cn">名字</label><input id="cn" className="input" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={tried && missing.name} aria-describedby="name-err" />{err('name', '請填寫名字。')}</div>
      <div className="field"><label htmlFor="cc">Email 或 LINE ID</label><input id="cc" className="input" autoComplete="email" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} aria-invalid={tried && missing.contact} aria-describedby="contact-err" />{err('contact', '請留下 Email 或 LINE ID。')}</div>
      <div className="field"><label htmlFor="cd">希望諮詢的日期</label><input id="cd" className="input" type="date" min={studioToday()} value={f.preferredDate} onChange={(e) => setF({ ...f, preferredDate: e.target.value })} aria-invalid={tried && missing.preferredDate} aria-describedby="preferredDate-err" />{err('preferredDate', '請選擇日期。')}</div>
      <div className="field"><label htmlFor="cw">想練習什麼？</label><textarea id="cw" className="input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="例如：想把高音唱穩、準備婚禮獻唱" /></div>
      {send.isError && <div className="notice error" role="alert"><Icon name="info" /><span>{(send.error as Error).message}</span></div>}
      <button className="btn primary block" disabled={send.isPending}>{send.isPending ? '送出中…' : '送出諮詢申請'}</button>
      <p className="caption">只用來聯絡你，不會用在其他地方。</p>
    </form>
  );
}
