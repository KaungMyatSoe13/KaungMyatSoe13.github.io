"use client";

import { useEffect, useRef } from "react";

/*
 * Full-screen project-page background in the reference site's look: a black-and-white,
 * high-contrast picture seen through a curved CRT lens, with soft VHS line wobble,
 * scanlines, grain and a dark vignette. Moving the pointer turns the view the opposite
 * way (pointer left → picture right), eased. Plain WebGL2; without it, the image shows.
 */

const PARALLAX = 0.05;  // how far the view moves with the pointer
const BEND = 0.22;      // CRT curve
const ZOOM = 1.2;       // a little extra size so the edges never show while moving

const VERT = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_img;
uniform vec2 u_mouse, u_res;
uniform float u_t, u_imgAspect;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
vec3 pic(vec2 q){
  // q: screen point, aspect-corrected, centre 0. Cover-fit the image, with parallax.
  float sa = u_res.x / u_res.y;
  vec2 s = q / ${ZOOM.toFixed(3)} - u_mouse * ${PARALLAX.toFixed(3)};
  vec2 uv = vec2(s.x / sa, s.y) * 0.5;
  if (u_imgAspect > sa) uv.x *= sa / u_imgAspect; else uv.y *= u_imgAspect / sa;
  return texture(u_img, vec2(uv.x + 0.5, 0.5 - uv.y)).rgb;
}
void main(){
  float sa = u_res.x / u_res.y;
  vec2 q = (v_uv * 2.0 - 1.0) * vec2(sa, 1.0);
  // CRT curve
  float r2 = dot(q / vec2(sa, 1.0), q / vec2(sa, 1.0));
  q *= 1.0 + ${BEND.toFixed(3)} * r2 * 0.5;
  // soft VHS line wobble
  float line = floor(v_uv.y * 360.0);
  q.x += (noise(vec2(line * 0.15, u_t * 4.0)) - 0.5) * 0.004;
  vec3 c;
  c = pic(q);
  // black and white (the owner's grade sets the darkness), plus a soft glow
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // soft glow: blur the bright parts and add them back
  float glow = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785;
    vec2 o2 = vec2(cos(a), sin(a)) * 0.035;
    float b2 = dot(pic(q + o2), vec3(0.299, 0.587, 0.114));
    glow += smoothstep(0.35, 0.7, b2);
  }
  // black and white, with a little extra contrast
  float bw = smoothstep(0.02, 0.85, l);
  vec3 col = vec3(bw + glow / 8.0 * 0.12);
  // dark vignette, like a room lit from the middle
  float v = smoothstep(1.55, 0.35, length(q / vec2(sa * 0.85, 1.0)));
  col *= 0.8 + 0.2 * v;
  // scanlines and grain
  col *= 1.0 - 0.06 * step(0.5, fract(v_uv.y * 300.0));
  col += (hash(v_uv * u_res + u_t) - 0.5) * 0.05;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export default function SceneBackdrop({ src }: { src: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl2");
    if (!gl) return;
    const sh = (t: number, s: string) => { const x = gl.createShader(t)!; gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) ?? ""); return x; };
    const prog = gl.createProgram()!;
    try { gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); } catch (e) { console.warn("[scene]", e); return; }
    gl.bindAttribLocation(prog, 0, "a_pos"); gl.linkProgram(prog);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    let imgAspect = 16 / 9, ready = false;
    const img = new Image();
    img.src = src;
    img.decode().then(() => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      imgAspect = img.naturalWidth / img.naturalHeight; ready = true;
    }).catch(() => {});

    const fit = () => { const d = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(innerWidth * d); canvas.height = Math.round(innerHeight * d); };
    fit(); addEventListener("resize", fit);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tx = 0, ty = 0, mx = 0, my = 0, raf = 0;
    // opposite to the pointer: pointer left → picture moves right
    const onMove = (e: PointerEvent) => { tx = (e.clientX / innerWidth) * 2 - 1; ty = -((e.clientY / innerHeight) * 2 - 1); };
    addEventListener("pointermove", onMove, { passive: true });
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!ready) return;
      if (!reduced) { mx += (tx - mx) * 0.05; my += (ty - my) * 0.05; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(U("u_img"), 0);
      gl.uniform2f(U("u_mouse"), mx, my);
      gl.uniform2f(U("u_res"), canvas.width, canvas.height);
      gl.uniform1f(U("u_t"), (now - t0) / 1000);
      gl.uniform1f(U("u_imgAspect"), imgAspect);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", fit); removeEventListener("pointermove", onMove); };
  }, [src]);
  return <canvas ref={ref} className="scene-bg" aria-hidden="true" />;
}
