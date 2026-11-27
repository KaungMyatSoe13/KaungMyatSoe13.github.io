import { site } from "@/content/site";

/** The Worker (worker/) that also runs the chat: its /contact sends the form through Gmail SMTP. */
const URL_ = (process.env.NEXT_PUBLIC_CHAT_URL ?? "").replace(/\/$/, "");

/** Google reCAPTCHA v3 site key (public; repo variable NEXT_PUBLIC_RECAPTCHA_SITEKEY). Unset = off. */
export const RECAPTCHA_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITEKEY ?? "";
type Grecaptcha = { ready(cb: () => void): void; execute(key: string, o: { action: string }): Promise<string> };
let loading: Promise<Grecaptcha | null> | null = null;

/** Loads reCAPTCHA v3 once (called when the visitor starts on the form, so it can watch a little
 *  of the visit; v3 is invisible: no puzzle, it only gives a score). */
export function loadRecaptcha(): Promise<Grecaptcha | null> {
  if (!RECAPTCHA_KEY || typeof window === "undefined") return Promise.resolve(null);
  loading ??= new Promise((resolve) => {
    const w = window as unknown as { grecaptcha?: Grecaptcha };
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(RECAPTCHA_KEY)}`;
    s.async = true;
    s.onload = () => (w.grecaptcha ? w.grecaptcha.ready(() => resolve(w.grecaptcha!)) : resolve(null));
    s.onerror = () => { loading = null; resolve(null); };
    document.head.appendChild(s);
  });
  return loading;
}
async function recaptchaToken() {
  const g = await loadRecaptcha();
  if (!g) return "";
  try { return await g.execute(RECAPTCHA_KEY, { action: "contact" }); } catch { return ""; }
}

export type ContactResult = { ok: true } | { ok: false; message: string; fallback?: boolean };

/** The visitor's own mail app with the message filled in (the old way; used when sending fails). */
export function openMailApp(name: string, from: string, msg: string) {
  window.location.href = `mailto:${site.email}?subject=${encodeURIComponent(`Hello from ${name}`)}&body=${encodeURIComponent(`${msg}\n\n${name}\n${from}`)}`;
}

/**
 * Sends the contact form. `website` is the hidden field only bots fill in. If the mail service
 * isn't reachable or set up, the result asks for the mail-app fallback instead.
 */
export async function sendContact(form: FormData): Promise<ContactResult> {
  const data = {
    name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""),
    message: String(form.get("message") ?? ""), website: String(form.get("website") ?? ""),
  };
  if (!URL_) return { ok: false, message: "", fallback: true };
  try {
    const recaptcha = await recaptchaToken();
    const r = await fetch(`${URL_}/contact`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, recaptcha }) });
    if (r.ok) return { ok: true };
    const d = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
    // the human check failed (or reCAPTCHA isn't set up for this address): a real visitor still
    // gets through, by their own mail app
    if (d.error === "verify") return { ok: false, message: "", fallback: true };
    if (d.message) return { ok: false, message: d.message };
    return { ok: false, message: "", fallback: true };                // not set up / send failed
  } catch {
    return { ok: false, message: "", fallback: true };                // offline / blocked
  }
}
