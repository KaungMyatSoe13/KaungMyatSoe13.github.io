"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { music } from "@/lib/music";
import { site } from "@/content/site";
import { projects } from "@/content/projects";
import Bmo, { type BmoMood, type Emotion } from "./Bmo";

/** The Worker that answers (worker/); without it the button doesn't show. */
const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_URL ?? "";
/** Cloudflare Turnstile site key (the bot check); optional. */
const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? "";
const STORE = "kfolio:askk", MAX_CHARS = 600;
/** What BMO says when you hover it (picked at random): cute, and an invitation to ask. */
const HOVER_LINES = [
  "Psst! Ask me anything about K!",
  "Hi hi! Wanna know what K builds?",
  "I know all of K's secrets (the public ones)!",
  "Ask me about his projects!",
  "Click me! I don't bite, I'm a robot!",
  "Curious about his tech stack?",
  "Is he open to work? Ask me!",
  "BMO is ready to chat!",
];
const CHIPS = ["What does K build?", "What's his tech stack?", "Is he open to work?"];

type Msg = { role: "user" | "assistant"; content: string };

/** BMO's reaction to the visitor's question (before the answer). */
function feelQuestion(q: string): Emotion {
  const s = q.toLowerCase();
  if (/\b(phone|number|address|where (does )?he live|salary|rate|price|how much|age\b|girlfriend|password)\b/.test(s)) return "secret";
  if (/\b(stupid|dumb|ugly|hate|suck|trash|bad|boring)\b/.test(s)) return "sad";
  if (/\b(love|cool|awesome|amazing|great|nice|impressive|beautiful|wow|good job|talented)\b/.test(s)) return "love";
  if (/^(hi|hey|hello|yo|sup|good (morning|evening|afternoon))\b/.test(s)) return "excited";
  if (/\b(really|seriously|no way|omg)\b/.test(s)) return "surprised";
  return "neutral";
}
/** BMO's feeling once the answer is in (the question's reaction wins for secrets / love / rude). */
function feelAnswer(q: Emotion, a: string): Emotion {
  if (q === "secret" || q === "love" || q === "sad") return q;
  const s = a.toLowerCase();
  if (/(something went wrong|can't reach|closed for today|out of free|too fast)/.test(s)) return "sad";
  if (/(i don't know|i do not know|not sure)/.test(s)) return "confused";
  if (/(can't help|cannot help|only (answer|help|know)|instead!?$)/.test(s)) return "confused";
  if (q === "excited" || q === "surprised") return "excited";
  if (/!/.test(a) || /\b(built|launched|shipped|award|love|excited|full-stack|projects?)\b/.test(s)) return "excited";
  return "happy";
}
type Turnstile = { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id?: string): void };

/** Plain text with URLs turned into links. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]+)/g);
  return <>{parts.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p.replace(/[.,]$/, "")} target="_blank" rel="noopener noreferrer">{p}</a>
    : /@/.test(p) && /^[\w.+-]+@/.test(p) ? <a key={i} href={`mailto:${p}`}>{p}</a> : p))}</>;
}

/**
 * "Ask K": an AI assistant that answers visitors' questions about K (Claude Haiku via the
 * worker/ Cloudflare Worker, which holds the key and his profile). An arcade button bottom-left
 * on every page opens a CRT-style chat; answers stream in. The conversation lives in this tab
 * only (sessionStorage). A Turnstile bot check starts each conversation; the Worker then hands
 * back a 30-minute pass.
 */
export default function AskK() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // BMO's face follows the chat: hover, open, thinking (waiting), talking (streaming)
  const mood = useRef<BmoMood>({ open: false, hover: false, thinking: false, talking: false, emotion: "neutral", until: 0 });
  const feel = (e: Emotion, ms: number) => { mood.current.emotion = e; mood.current.until = performance.now() + ms; };
  mood.current.open = open;
  const [greet, setGreet] = useState(false);
  const [hoverLine, setHoverLine] = useState("");
  useEffect(() => {
    // once per visit, BMO says hi after a while
    let seen = false;
    try { seen = !!sessionStorage.getItem("kfolio:bmo-hi"); } catch {}
    if (seen) return;
    const a = window.setTimeout(() => { setGreet(true); try { sessionStorage.setItem("kfolio:bmo-hi", "1"); } catch {} }, 6000);
    const b = window.setTimeout(() => setGreet(false), 13000);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, []);
  const [note, setNote] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tsRef = useRef<HTMLDivElement>(null);
  const token = useRef(""), pass = useRef(""), widget = useRef<string | null>(null);

  // the conversation and pass survive page changes in this tab only
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(STORE) ?? "null");
      if (s?.msgs) setMsgs(s.msgs);
      if (s?.pass) pass.current = s.pass;
    } catch {}
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify({ msgs, pass: pass.current })); } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  // the bot check: loaded only when the chat opens
  useEffect(() => {
    if (!open || !SITEKEY || widget.current !== null) return;
    const w = window as unknown as { turnstile?: Turnstile };
    const render = () => {
      if (!w.turnstile || !tsRef.current || widget.current !== null) return;
      widget.current = w.turnstile.render(tsRef.current, {
        sitekey: SITEKEY, appearance: "interaction-only", theme: "dark",
        callback: (t: string) => { token.current = t; },
        "expired-callback": () => { token.current = ""; },
      });
    };
    if (w.turnstile) { render(); return; }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.onload = render;
    document.head.appendChild(s);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  /** Where the visitor is right now, so "this project" / "this page" makes sense to the AI. */
  const whereNow = () => {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const slug = path.match(/^\/projects\/([^/]+)$/)?.[1];
    const proj = slug ? projects.find((x) => x.slug === slug) : undefined;
    if (proj) return { kind: "project", project: proj.name };
    if (path === "/about") return { kind: "about" };
    if (path === "/") {
      const h = document.documentElement;
      if (h.hasAttribute("data-sc-pinned")) return { kind: "showcase", project: h.dataset.scActive };
      return { kind: "home" };
    }
    return { kind: "other" };
  };

  const lastSent = useRef(0);
  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    if (q.length >= MAX_CHARS) { setNote(`Keep it under ${MAX_CHARS} characters, please.`); return; }
    // spam brakes: a short pause between questions, and a cap per visit (the Worker has its own)
    const nowMs = Date.now();
    if (nowMs - lastSent.current < 2500) { setNote("One at a time, please. Give it a second."); return; }
    if (msgs.filter((m) => m.role === "user").length >= 20) { setNote("That's the limit for this visit. Email K for anything else!"); return; }
    lastSent.current = nowMs;
    setNote(""); setDraft(""); setBusy(true); music.blip();
    const history: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    const qFeel = feelQuestion(q);
    feel(qFeel, 1400);                                     // a quick reaction to the question
    let answer = "", started = false;
    // after the quick reaction, BMO thinks until the answer starts
    window.setTimeout(() => { if (!started) { mood.current.emotion = "neutral"; mood.current.thinking = true; } }, qFeel === "neutral" ? 0 : 900);
    const put = (t: string) => { answer = t; setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: t }]); };
    try {
      const r = await fetch(`${CHAT_URL.replace(/\/$/, "")}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, page: whereNow(), pass: pass.current || undefined, turnstile: pass.current ? undefined : token.current || undefined }),
      });
      const p = r.headers.get("x-ask-k-pass");
      if (p) pass.current = p;
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        if (d.error === "verify") { pass.current = ""; token.current = ""; if (widget.current) (window as unknown as { turnstile?: Turnstile }).turnstile?.reset(widget.current); }
        put(d.message ?? "Something went wrong. You can always email K at " + site.email);
        return;
      }
      const reader = r.body.getReader(), dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        if (!started) { started = true; feel(feelAnswer(qFeel, acc), 600000); mood.current.thinking = false; mood.current.talking = true; }
        put(acc);
      }
      if (!acc.trim()) put("Hmm, I lost my train of thought. Try asking again?");
    } catch {
      put(`I can't reach the arcade right now. Email K at ${site.email} instead!`);
    } finally {
      started = true; mood.current.thinking = false; mood.current.talking = false;
      feel(feelAnswer(qFeel, answer), 5000);                  // hold the feeling a few seconds
      setBusy(false);
    }
  }, [busy, msgs]);

  if (!CHAT_URL) return null;
  return (
    <>
      <button
        type="button"
        className="askk-btn"
        data-open={open}
        aria-expanded={open}
        aria-controls="askk"
        onClick={() => { setOpen((o) => !o); setGreet(false); music.blip(); }}
        onPointerEnter={() => { mood.current.hover = true; setGreet(false); setHoverLine(HOVER_LINES[Math.floor(Math.random() * HOVER_LINES.length)]); }}
        onPointerLeave={() => { mood.current.hover = false; setHoverLine(""); }}
        aria-label={open ? "Close the chat" : "Ask K's AI assistant"}
      >
        <Bmo mood={mood} />
      </button>
      {(hoverLine || greet) && !open && <p className="askk-hi" aria-hidden="true">{hoverLine || "Hi! Ask me about K"}</p>}
      {open && (
        <section id="askk" className="askk" role="dialog" aria-label="Ask K, an AI assistant about Kaung Myat Soe">
          <header className="askk__top">
            <p className="askk__title">Ask K <span>AI assistant</span></p>
            <button type="button" className="askk__close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </header>
          <div ref={listRef} className="askk__list" aria-live="polite">
            <p className="askk__msg askk__msg--bot">Hi! I&apos;m K&apos;s assistant. Ask me anything about his work, skills or projects.</p>
            {msgs.map((m, i) => (
              <p key={i} className={`askk__msg askk__msg--${m.role === "user" ? "me" : "bot"}`} data-typing={busy && i === msgs.length - 1 && m.role === "assistant"}>
                {m.role === "assistant" ? <Linked text={m.content} /> : m.content}
              </p>
            ))}
          </div>
          {msgs.length === 0 && (
            <div className="askk__chips">
              {CHIPS.map((c) => <button key={c} type="button" onClick={() => void send(c)}>{c}</button>)}
            </div>
          )}
          <form className="askk__form" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={MAX_CHARS}
              placeholder="Type a question…"
              aria-label="Your question"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
            />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Send">▶</button>
          </form>
          <div ref={tsRef} className="askk__check" />
          <p className="askk__note">
            {note || <>AI · can make mistakes · {/* the model runs on Cloudflare Workers AI: their privacy policy covers the requests */}
              <a className="askk__privacy-btn" href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Privacy</a></>}
          </p>
        </section>
      )}
    </>
  );
}
