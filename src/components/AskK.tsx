"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { music } from "@/lib/music";
import { site } from "@/content/site";

/** The Worker that answers (worker/); without it the button doesn't show. */
const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_URL ?? "";
/** Cloudflare Turnstile site key (the bot check); optional. */
const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? "";
const STORE = "kfolio:askk", MAX_CHARS = 600;
const CHIPS = ["What does K build?", "What's his tech stack?", "Is he open to work?"];

type Msg = { role: "user" | "assistant"; content: string };
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

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    if (q.length >= MAX_CHARS) { setNote(`Keep it under ${MAX_CHARS} characters, please.`); return; }
    setNote(""); setDraft(""); setBusy(true); music.blip();
    const history: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    const put = (t: string) => setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: t }]);
    try {
      const r = await fetch(`${CHAT_URL.replace(/\/$/, "")}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, pass: pass.current || undefined, turnstile: pass.current ? undefined : token.current || undefined }),
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
        put(acc);
      }
      if (!acc.trim()) put("Hmm, I lost my train of thought. Try asking again?");
    } catch {
      put(`I can't reach the arcade right now. Email K at ${site.email} instead!`);
    } finally {
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
        onClick={() => { setOpen((o) => !o); music.blip(); }}
      >
        <span className="askk-btn__coin" aria-hidden="true">▶</span> Ask K
      </button>
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
          <p className="askk__note">{note || <>AI, can make mistakes. For anything important, <a href={`mailto:${site.email}`}>email K</a>.</>}</p>
        </section>
      )}
    </>
  );
}
