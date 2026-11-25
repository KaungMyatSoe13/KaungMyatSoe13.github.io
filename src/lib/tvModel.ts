import type * as Three from "three";

/** What the About page's TVs share: where their screen is, and a canvas mapped onto it. */
export type TvModel = {
  model: Three.Object3D;
  /** The screen mesh (its picture is `tex`). */
  screen: Three.Mesh | null;
  /** The picture's corners in the screen mesh's own space: top-left, top-right, bottom-right, bottom-left. */
  corners: Three.Vector3[];
  /** Width / height of the whole TV. */
  aspect: number;
};

/**
 * Loads the old TV ("vintage old TV" by FArHAn's 3D worKs, CC BY 4.0, credited on the About
 * page), centred and 2 units tall, with `tex` stretched over exactly the screen's UV box.
 */
export async function loadTv(THREE: typeof Three, tex: Three.Texture, onProgress?: (e: ProgressEvent) => void): Promise<TvModel> {
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync("/about/tv.glb", onProgress);
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const s = 2 / size.y;
  model.scale.setScalar(s);
  model.position.copy(mid.multiplyScalar(-s));
  let screen: Three.Mesh | null = null;
  const corners: Three.Vector3[] = [];
  model.traverse((o) => {
    const m = o as Three.Mesh;
    if (!m.isMesh || !/^Plane/.test(m.name) || screen) return;
    screen = m;
    // the screen's UVs cover only part of 0..1: stretch the picture over exactly that part
    const uv = m.geometry.getAttribute("uv"), pos = m.geometry.getAttribute("position");
    let u0 = 1, u1 = 0, v0 = 1, v1 = 0;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    tex.repeat.set(1 / (u1 - u0), 1 / (v1 - v0));
    tex.offset.set(-u0 / (u1 - u0), -v0 / (v1 - v0));
    m.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    // the vertex nearest each corner of that box (the canvas's top is v1: textures flip y)
    for (const [cu, cv] of [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < uv.count; i++) { const d = (uv.getX(i) - cu) ** 2 + (uv.getY(i) - cv) ** 2; if (d < bd) { bd = d; best = i; } }
      corners.push(new THREE.Vector3(pos.getX(best), pos.getY(best), pos.getZ(best)));
    }
  });
  return { model, screen, corners, aspect: size.x / size.y };
}

/** The other models the falling TV glitches into (all CC BY 4.0, credited on the About page). */
export type Shell = {
  url: string;
  /** Where its screen is: the screen mesh's name, or (one-mesh models) the glass's box seen
   *  from the front, as shares of the model's box [left, top, right, bottom] (measured by
   *  casting rays from the front; the glass bulges out of the frame). */
  screen?: RegExp | [number, number, number, number];
  /** Share of the screen's box to keep clear of its rounded corners. */
  inset?: number;
  /** Turn about y so its front faces +z (radians). */
  rotY?: number;
  /** Size on top of the fit (e.g. its antennas make the fit too small). */
  scale?: number;
  /** The glass's own outline (rounded corners), as rows [y, left, right] in shares of the
   *  model's box (y up from the bottom), measured once with `measureGlass` (dev only, slow).
   *  The picture then follows it instead of a rectangle inside `screen`. */
  outline?: [number, number, number][];
};

/**
 * Loads one of them, fitted inside the main TV's box (2 tall, `aspect` × 2 wide), facing +z.
 * A TV gets a fine grid laid over its glass (found by casting rays from the front) that shows
 * `tex`, so its screen can play the same picture as the main TV.
 */
export async function loadShell(THREE: typeof Three, shell: Shell, tex: Three.Texture, aspect: number): Promise<Three.Group> {
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(shell.url);
  const inner = gltf.scene;
  inner.rotation.y = shell.rotY ?? 0;
  const model = new THREE.Group();
  model.add(inner);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const s = Math.min(2 / size.y, (2 * aspect) / size.x) * (shell.scale ?? 1);
  model.scale.setScalar(s);
  model.position.copy(mid.multiplyScalar(-s));
  const wrap = new THREE.Group();
  wrap.add(model);
  wrap.updateMatrixWorld(true);
  if (!shell.screen) return wrap;

  // where the glass is, seen from the front
  const rc = new THREE.Raycaster();
  const dir = new THREE.Vector3(0, 0, -1), from = new THREE.Vector3();
  const b = new THREE.Box3().setFromObject(wrap);
  // a named screen: cast at that mesh alone (fast); a box: at the whole model
  let target: Three.Object3D = wrap;
  if (shell.screen instanceof RegExp) wrap.traverse((o) => { if ((o as Three.Mesh).isMesh && (shell.screen as RegExp).test(o.name)) target = o; });
  // its own picture goes dark under ours (some models ship with real TV-show art there)
  if (target !== wrap) (target as Three.Mesh).material = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const hit = (x: number, y: number) => { rc.set(from.set(x, y, b.max.z + 1), dir); return rc.intersectObject(target, true)[0]; };
  const isGlass = (h: Three.Intersection | undefined) => !!h && (Array.isArray(shell.screen) || target !== wrap);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  if (Array.isArray(shell.screen)) {
    const [l, t, r, bo] = shell.screen, W = b.max.x - b.min.x, H = b.max.y - b.min.y;
    x0 = b.min.x + l * W; x1 = b.min.x + r * W; y1 = b.max.y - t * H; y0 = b.max.y - bo * H;
  } else {
    const G = 36;
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const x = b.min.x + (i / G) * (b.max.x - b.min.x), y = b.min.y + (j / G) * (b.max.y - b.min.y);
      if (isGlass(hit(x, y))) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
  }
  if (!isFinite(x0)) return wrap;
  if (shell.outline) {
    const W = b.max.x - b.min.x, H = b.max.y - b.min.y;
    const glass = outlineMesh(THREE, hit, shell.outline.map(([y, l, r]) => ({ y: b.min.y + y * H, l: b.min.x + l * W, r: b.min.x + r * W })));
    glass.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); glass.name = "screen"; wrap.add(glass);
    return wrap;
  }
  const ins = shell.inset ?? 0.06, dx = (x1 - x0) * ins, dy = (y1 - y0) * ins;
  x0 += dx; x1 -= dx; y0 += dy; y1 -= dy;
  // a grid that follows the glass's curve, just in front of it
  const NX = 20, NY = 16, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let lastZ = b.max.z;
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const u = i / NX, v = j / NY, x = x0 + u * (x1 - x0), y = y0 + v * (y1 - y0);
    const h = hit(x, y);
    const z = h && isGlass(h) ? h.point.z : lastZ;
    lastZ = z;
    pos.push(x, y, z + 0.006); uv.push(u, v);
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i;
    idx.push(a, a + 1, a + NX + 1, a + 1, a + NX + 2, a + NX + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const glass = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  glass.name = "screen";
  wrap.add(glass);
  return wrap;
}

/**
 * Dev helper (slow, seconds): the glass's own outline, for `Shell.outline`. Rays from the front
 * across (a little more than) `screen`'s box; a ray hits glass when the texture colour there is
 * close to the colour at the box's centre. Each row spans its first to last glass hit; spikes
 * (reflections, the bezel) are smoothed out. Returns rows [y, left, right] in shares of the box.
 */
export async function measureGlass(THREE: typeof Three, shell: Shell, rowsOut = 24): Promise<[number, number, number][] | null> {
  const wrap = await loadShell(THREE, { ...shell, screen: undefined, outline: undefined }, new THREE.Texture(), 1);
  const b = new THREE.Box3().setFromObject(wrap);
  const W = b.max.x - b.min.x, H = b.max.y - b.min.y;
  const [l0, t0, r0, b0] = shell.screen as [number, number, number, number];
  const x0 = b.min.x + l0 * W, x1 = b.min.x + r0 * W, y1 = b.max.y - t0 * H, y0 = b.max.y - b0 * H;
  const rc = new THREE.Raycaster(), dir = new THREE.Vector3(0, 0, -1), from = new THREE.Vector3();
  const hit = (x: number, y: number) => { rc.set(from.set(x, y, b.max.z + 1), dir); return rc.intersectObject(wrap, true)[0]; };
  const pix = new Map<unknown, { d: Uint8ClampedArray; w: number; h: number }>();
  const colourAt = (h: Three.Intersection | undefined) => {
    const map = ((h?.object as Three.Mesh | undefined)?.material as Three.MeshStandardMaterial | undefined)?.map;
    if (!h || !h.uv || !map?.image) return null;
    let p = pix.get(map.image);
    if (!p) {
      const img = map.image as CanvasImageSource & { width: number; height: number };
      const w = Math.min(512, img.width), hh = Math.round((img.height * w) / img.width);
      const c = document.createElement("canvas"); c.width = w; c.height = hh;
      const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(img, 0, 0, w, hh);
      p = { d: g.getImageData(0, 0, w, hh).data, w, h: hh }; pix.set(map.image, p);
    }
    const u = ((h.uv.x % 1) + 1) % 1, v = ((h.uv.y % 1) + 1) % 1;               // glTF: v down
    const k = (Math.min(p.h - 1, Math.floor(v * p.h)) * p.w + Math.min(p.w - 1, Math.floor(u * p.w))) * 4;
    return [p.d[k], p.d[k + 1], p.d[k + 2]];
  };
  const ref = colourAt(hit((x0 + x1) / 2, (y0 + y1) / 2));
  if (!ref) return null;
  const isGlass = (x: number, y: number) => {
    const c = colourAt(hit(x, y));
    return !!c && Math.abs(c[0] - ref[0]) + Math.abs(c[1] - ref[1]) + Math.abs(c[2] - ref[2]) < 90;
  };
  const mx = (x1 - x0) * 0.08, my = (y1 - y0) * 0.08;
  const sx0 = x0 - mx, sx1 = x1 + mx, sy0 = y0 - my, sy1 = y1 + my;
  const S = 160, R = 80;
  let rows: { y: number; l: number; r: number }[] = [];
  for (let j = 0; j <= R; j++) {
    const y = sy0 + (j / R) * (sy1 - sy0);
    let l = Infinity, r = -Infinity;
    for (let i = 0; i <= S; i++) { const x = sx0 + (i / S) * (sx1 - sx0); if (isGlass(x, y)) { l = Math.min(l, x); r = Math.max(r, x); } }
    if (r > l) rows.push({ y, l, r });
  }
  if (rows.length < 6) return null;
  const wMax = Math.max(...rows.map((q) => q.r - q.l));
  rows = rows.filter((q) => q.r - q.l > wMax * 0.5);
  // spikes: each side is the median of its neighbours, and no wider than the middle rows
  const med = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
  const mid = rows.slice(Math.floor(rows.length * 0.3), Math.ceil(rows.length * 0.7));
  const lMin = med(mid.map((q) => q.l)), rMax = med(mid.map((q) => q.r));
  rows = rows.map((q, j) => {
    const nb = rows.slice(Math.max(0, j - 3), j + 4);
    return { y: q.y, l: Math.max(lMin, med(nb.map((n) => n.l))), r: Math.min(rMax, med(nb.map((n) => n.r))) };
  });
  // a few inner rows, evenly spaced
  const out: [number, number, number][] = [];
  for (let k = 0; k < rowsOut; k++) {
    const q = rows[Math.round((k / (rowsOut - 1)) * (rows.length - 1))];
    out.push([+((q.y - b.min.y) / H).toFixed(4), +((q.l - b.min.x) / W).toFixed(4), +((q.r - b.min.x) / W).toFixed(4)]);
  }
  return out;
}

/** A grid over the glass from its outline rows (bottom to top), on the glass's curve; the
 *  picture spans the whole glass (uv = position in its box). */
function outlineMesh(THREE: typeof Three, hit: (x: number, y: number) => Three.Intersection | undefined, rows: { y: number; l: number; r: number }[]) {
  const gl = Math.min(...rows.map((q) => q.l)), gr = Math.max(...rows.map((q) => q.r));
  const gb = rows[0].y, gt = rows[rows.length - 1].y;
  const NX = 24, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  rows.forEach((q, j) => {
    for (let i = 0; i <= NX; i++) {
      const x = q.l + (i / NX) * (q.r - q.l);
      const h = hit(x, q.y);
      pos.push(x, q.y, (h ? h.point.z : 0) + 0.006);
      uv.push((x - gl) / (gr - gl), (q.y - gb) / (gt - gb));
    }
    if (j > 0) for (let i = 0; i < NX; i++) {
      const a = (j - 1) * (NX + 1) + i;
      idx.push(a, a + 1, a + NX + 1, a + 1, a + NX + 2, a + NX + 1);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return new THREE.Mesh(geo);
}
