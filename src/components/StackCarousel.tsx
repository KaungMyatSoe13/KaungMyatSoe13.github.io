"use client";

import { useEffect, useRef } from "react";
import { stack } from "@/content/stack";

/** px per logo slot (logo + name), the logo's size, and how fast the row runs (px/s), at full
 *  size; phones and tablets scale them down (`sizeK`) */
const SLOT0 = 220, LOGO0 = 116, SPEED = 38;
/** The logo sits a little above the row's middle; its name (sharp text) below it. */
const LIFT0 = 16, NAME_GAP0 = 30;
const sizeK = () => (innerWidth <= 760 ? 0.55 : innerWidth <= 1100 || matchMedia("(pointer: coarse)").matches ? 0.72 : 1);

const VS = `#version 300 es
in vec2 a_pos; in float a_slot; in vec3 a_seed;
uniform vec2 u_res; uniform float u_off, u_L, u_slot, u_dpr, u_t, u_in, u_size, u_lift;
uniform vec2 u_mouse;
out float v_a; out float v_work;
uniform float u_work[32];
void main(){
  // the slot's centre, scrolled and wrapped round (the row loops forever)
  float cx = mod(a_slot * u_slot + u_slot * 0.5 - u_off + u_slot, u_L) - u_slot;
  vec2 p = vec2(cx, u_res.y * 0.5 - u_lift) + a_pos;
  // arrive from a loose cloud when the section comes into view
  vec2 away = p + (a_seed.xy - 0.5) * vec2(u_res.y * 1.4, u_res.y * 0.9);
  float k = clamp(u_in * 1.4 - a_seed.z * 0.4, 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);
  p = mix(away, p, k);
  // a little life, and the pointer nudges them aside (they spring back: no memory)
  p += vec2(sin(u_t * 1.3 + a_seed.z * 40.0), cos(u_t * 1.1 + a_seed.x * 30.0)) * 0.6;
  vec2 d = p - u_mouse; float l = length(d);
  p += d / max(l, 1.0) * max(0.0, 70.0 - l) * 0.45;
  gl_Position = vec4(p / u_res * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  gl_PointSize = u_size * u_dpr;
  v_a = (0.78 + 0.22 * a_seed.y) * k;
  v_work = u_work[int(a_slot)];
}`;
const FS = `#version 300 es
precision mediump float;
in float v_a; in float v_work; out vec4 o;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  vec3 col = mix(vec3(0.93, 0.91, 0.87), vec3(1.0, 0.82, 0.12), v_work);   // work tools in yellow
  o = vec4(col, v_a);
}`;

/** Particle spots for one logo, around its centre (px): dense enough to read the shape. */
function logoPoints(d: string, size: number) {
  const S = Math.round(size), c = document.createElement("canvas");
  c.width = S; c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#fff";
  g.scale(S / 24, S / 24);
  g.fill(new Path2D(d));
  const px = g.getImageData(0, 0, S, S).data, out: number[] = [];
  const st = S < 90 ? 1.05 : 1.25;                                // small logos: a little denser
  for (let y = 0; y < S; y += st) for (let x = 0; x < S; x += st) {
    const a = px[(Math.floor(y) * S + Math.floor(x)) * 4 + 3];
    if (a > 110 && Math.random() < 0.85) out.push(x - S / 2 + Math.random() * 0.6, y - S / 2 + Math.random() * 0.6);
  }
  return out;
}

/**
 * About page, "Tech stack": every tool's logo (and name) as particles that stay put (their
 * own canvas, not part of the portrait's travelling particles), on a row that loops sideways
 * by itself, slows under the pointer and can be dragged. Particles gather when the section
 * comes into view and nudge away from the pointer. Renders only while on screen.
 */
export default function StackCarousel() {
  const ref = useRef<HTMLCanvasElement>(null);
  const namesRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: false });
    if (!gl) return;
    const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    ["a_pos", "a_slot", "a_seed"].forEach((n, i) => gl.bindAttribLocation(prog, i, n));
    gl.linkProgram(prog);
    const U = (n: string) => gl.getUniformLocation(prog, n);

    const k = sizeK(), SLOT = SLOT0 * k, LOGO = LOGO0 * k, LIFT = LIFT0 * k, NAME_GAP = NAME_GAP0 * k;
    let count = 0;
    const vao = gl.createVertexArray();
    const build = () => {
      const pos: number[] = [], slot: number[] = [], seed: number[] = [];
      stack.forEach((t, i) => {
        const pts = logoPoints(t.d, LOGO);
        for (let k = 0; k < pts.length; k += 2) { pos.push(pts[k], pts[k + 1]); slot.push(i); seed.push(Math.random(), Math.random(), Math.random()); }
      });
      count = slot.length;
      gl.bindVertexArray(vao);
      const buf = (loc: number, data: number[], size: number) => {
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      };
      buf(0, pos, 2); buf(1, slot, 1); buf(2, seed, 3);
    };
    (document.fonts?.ready ?? Promise.resolve()).then(build);

    // the names: sharp text on a 2D canvas on top, moving exactly with the row
    const names = namesRef.current!, ng = names.getContext("2d")!;
    const mono = getComputedStyle(document.body).getPropertyValue("--font-mono").trim() || "monospace";
    let dpr = 1, W = 1, H = 1;
    const fit = () => {
      dpr = Math.min(devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      names.width = canvas.width; names.height = canvas.height;
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(canvas);

    // on screen? (render only then) and how far in (the particles gather)
    let visible = false;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: "100px 0px" });
    io.observe(canvas);

    // pointer: nudge, slow down, drag
    const m = { x: -9999, y: -9999, over: false, drag: false, lastX: 0, v: 0 };
    let off = 0, speed = SPEED;
    const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      // touch: a finger drags the row, but doesn't push the particles or slow it
      if (!touch) { m.x = e.clientX - r.left; m.y = e.clientY - r.top; m.over = m.y >= 0 && m.y <= r.height; }
      if (m.drag) { const dx = e.clientX - m.lastX; off -= dx; m.v = -dx; m.lastX = e.clientX; }
    };
    const onDown = (e: PointerEvent) => { m.drag = true; m.lastX = e.clientX; m.v = 0; canvas.setPointerCapture(e.pointerId); };
    const onUp = () => { m.drag = false; };
    const onLeave = () => { m.over = false; m.x = m.y = -9999; };
    // scroll it: a sideways swipe (or Shift + wheel) runs the row; up/down still scrolls the page
    const onWheel = (e: WheelEvent) => {
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!sideways && !e.shiftKey) return;
      e.preventDefault();
      const d = (sideways ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 16 : 1);
      off += d; m.v = d * 0.12;                                   // a little carry after
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const work = new Float32Array(32);
    stack.forEach((t, i) => { if (i < 32) work[i] = t.main ? 1 : 0; });
    let raf = 0, last = performance.now(), inK = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible || !count) return;
      // gather as the strip rises into view
      const r = canvas.getBoundingClientRect();
      const want = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.6)));
      inK += (want - inK) * (1 - Math.exp(-dt * 3));
      // run, slower under the pointer; a drag throws it
      speed += ((m.over ? SPEED * 0.2 : SPEED) - speed) * (1 - Math.exp(-dt * 4));
      if (!m.drag) { off += (reduced ? 0 : speed * dt) + m.v; m.v *= 0.92; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog); gl.bindVertexArray(vao);
      gl.uniform2f(U("u_res"), W, H);
      gl.uniform1f(U("u_off"), off);
      gl.uniform1f(U("u_slot"), SLOT);
      gl.uniform1f(U("u_L"), SLOT * stack.length);
      gl.uniform1f(U("u_dpr"), dpr);
      gl.uniform1f(U("u_size"), k < 1 ? 1.35 : 1.7);
      gl.uniform1f(U("u_lift"), LIFT);
      gl.uniform1f(U("u_t"), reduced ? 0 : (now - t0) / 1000);
      gl.uniform1f(U("u_in"), reduced ? 1 : inK);
      gl.uniform2f(U("u_mouse"), m.x, m.y);
      gl.uniform1fv(U("u_work"), work);
      gl.drawArrays(gl.POINTS, 0, count);
      // names under the logos (same wrap as the shader)
      ng.setTransform(dpr, 0, 0, dpr, 0, 0);
      ng.clearRect(0, 0, W, H);
      ng.font = `600 ${k < 0.7 ? 10 : k < 1 ? 11 : 13}px ${mono}`; ng.textAlign = "center"; ng.textBaseline = "top";
      ng.letterSpacing = k < 1 ? "1px" : "2px";
      const L = SLOT * stack.length, y = H / 2 - LIFT + LOGO / 2 + NAME_GAP - 12 * k;
      ng.globalAlpha = Math.max(0, inK * 1.6 - 0.6);
      stack.forEach((t, i) => {
        const cx = ((((i * SLOT + SLOT / 2 - off + SLOT) % L) + L) % L) - SLOT;
        if (cx < -SLOT || cx > W + SLOT) return;
        ng.fillStyle = t.main ? "#ffd21f" : "rgba(236, 233, 226, 0.86)";
        ng.fillText(t.name.toUpperCase(), cx, y);
      });
      ng.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp); canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);
  return (
    <>
      <div className="ab__stack-row">
        <canvas ref={ref} className="ab__stack-canvas" aria-hidden="true" />
        <canvas ref={namesRef} className="ab__stack-names" aria-hidden="true" />
      </div>
      <ul className="sr-only">{stack.map((t) => <li key={t.name}>{t.name}</li>)}</ul>
    </>
  );
}
