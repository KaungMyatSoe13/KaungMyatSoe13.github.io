// Shrink a .glb for the web (Sketchfab downloads are mostly huge textures, sometimes millions
// of triangles):
//   - every texture resized (max side --tex, default 512) and stored as WebP (EXT_texture_webp)
//   - optional: --merge bakes every mesh into one piece per material (thousands of small
//     objects → a few draw calls and a tiny scene graph; no skins/animations)
//   - optional: big meshes simplified to --ratio of their triangles (meshoptimizer), with
//     unused vertices dropped; --drop-tangents removes TANGENT (three derives them if needed)
// Everything else is copied as it is.
//
//   node scripts/shrink-glb.cjs in.glb out.glb [--tex 512] [--merge] [--ratio 0.1] [--error 0.02] [--min-tris 2000] [--drop-tangents]
//
// Uses sharp (installed with Next) and meshoptimizer (installed with @types/three).
const fs = require("fs");
const sharp = require("sharp");
const { MeshoptSimplifier } = require("meshoptimizer");

const args = process.argv.slice(2);
const [src, dst] = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1] || "").match(/^--(tex|ratio|error|min-tris)$/));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : +args[i + 1]; };
const TEX = opt("tex", 512), RATIO = opt("ratio", 1), ERR = opt("error", 0.02), MIN_TRIS = opt("min-tris", 2000);
const DROP_TAN = args.includes("--drop-tangents"), MERGE = args.includes("--merge");

// 4×4 column-major matrices
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const trs = (n) => {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
};
// normal matrix: inverse transpose of the upper 3×3
const normalMat = (m) => {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1;
  return [A / det, B / det, C / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det];
};

const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

(async () => {
  const b = fs.readFileSync(src);
  const jsonLen = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;
  const bin = b.slice(binStart, binStart + b.readUInt32LE(20 + jsonLen));
  const views = j.bufferViews.map((bv) => bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
  const strideOf = (a) => j.bufferViews[a.bufferView].byteStride || SIZE[a.componentType] * COMP[a.type];
  // one element of accessor a as raw bytes
  const elem = (a, i) => { const s = strideOf(a), o = (a.byteOffset || 0) + i * s; return views[a.bufferView].slice(o, o + SIZE[a.componentType] * COMP[a.type]); };
  const newView = (buf, target) => { views.push(buf); j.bufferViews.push({ buffer: 0, byteLength: buf.length, ...(target ? { target } : {}) }); return j.bufferViews.length - 1; };

  const readF = (a) => { const c = COMP[a.type], out = new Float32Array(a.count * c); for (let i = 0; i < a.count; i++) { const e = elem(a, i); for (let k = 0; k < c; k++) out[i * c + k] = a.componentType === 5126 ? e.readFloatLE(k * 4) : NaN; } return out; };
  const readIdx = (p, n) => {
    if (p.indices === undefined) return Uint32Array.from({ length: n }, (_, i) => i);
    const ia = j.accessors[p.indices], s = strideOf(ia), v = views[ia.bufferView], idx = new Uint32Array(ia.count);
    for (let i = 0; i < ia.count; i++) { const o = (ia.byteOffset || 0) + i * s; idx[i] = ia.componentType === 5125 ? v.readUInt32LE(o) : ia.componentType === 5123 ? v.readUInt16LE(o) : v[o]; }
    return idx;
  };

  // ---- merge: one piece per material (+ attribute set), transforms baked in ----
  if (MERGE && !(j.skins || []).length && !(j.animations || []).length) {
    const groups = new Map();
    const walk = (ni, parent) => {
      const n = j.nodes[ni], m = mul(parent, trs(n));
      if (n.mesh !== undefined) for (const p of j.meshes[n.mesh].primitives) {
        if ((p.mode ?? 4) !== 4 || p.targets) continue;
        const names = ["POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0"].filter((k) => p.attributes[k] !== undefined);
        if (names.some((k) => j.accessors[p.attributes[k]].componentType !== 5126 || j.accessors[p.attributes[k]].sparse)) continue;
        const key = `${p.material ?? -1}|${names.join(",")}|${j.accessors[p.attributes.COLOR_0]?.type ?? ""}`;
        if (!groups.has(key)) groups.set(key, { material: p.material, names, colorType: j.accessors[p.attributes.COLOR_0]?.type, parts: [] });
        groups.get(key).parts.push({ p, m });
      }
      for (const c of n.children || []) walk(c, m);
    };
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const r of j.scenes[j.scene || 0].nodes) walk(r, I);
    const prims = [];
    for (const g of groups.values()) {
      const data = Object.fromEntries(g.names.map((k) => [k, []])); const idx = []; let base = 0;
      for (const { p, m } of g.parts) {
        const pos = readF(j.accessors[p.attributes.POSITION]), n = pos.length / 3;
        for (let i = 0; i < n; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; data.POSITION.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]); }
        if (data.NORMAL) {
          const nm = normalMat(m), nr = readF(j.accessors[p.attributes.NORMAL]);
          for (let i = 0; i < n; i++) { const x = nr[i * 3], y = nr[i * 3 + 1], z = nr[i * 3 + 2]; let a = nm[0] * x + nm[1] * y + nm[2] * z, bb = nm[3] * x + nm[4] * y + nm[5] * z, c = nm[6] * x + nm[7] * y + nm[8] * z; const l = Math.hypot(a, bb, c) || 1; data.NORMAL.push(a / l, bb / l, c / l); }
        }
        for (const k of ["TEXCOORD_0", "COLOR_0"]) if (data[k]) for (const v of readF(j.accessors[p.attributes[k]])) data[k].push(v);
        // a mirrored transform flips the triangles' winding: flip them back
        const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
        const ix = readIdx(p, n);
        for (let i = 0; i < ix.length; i += 3) det < 0 ? idx.push(ix[i] + base, ix[i + 2] + base, ix[i + 1] + base) : idx.push(ix[i] + base, ix[i + 1] + base, ix[i + 2] + base);
        base += n;
      }
      const attrs = {};
      for (const k of g.names) {
        const f = Float32Array.from(data[k]), type = k === "TEXCOORD_0" ? "VEC2" : k === "COLOR_0" ? g.colorType : "VEC3";
        const a = { bufferView: newView(Buffer.from(f.buffer), 34962), componentType: 5126, count: f.length / COMP[type], type };
        if (k === "POSITION") { a.min = [0, 1, 2].map((c) => { let v = Infinity; for (let i = c; i < f.length; i += 3) v = Math.min(v, f[i]); return v; }); a.max = [0, 1, 2].map((c) => { let v = -Infinity; for (let i = c; i < f.length; i += 3) v = Math.max(v, f[i]); return v; }); }
        j.accessors.push(a); attrs[k] = j.accessors.length - 1;
      }
      const iu = Uint32Array.from(idx);
      j.accessors.push({ bufferView: newView(Buffer.from(iu.buffer), 34963), componentType: 5125, count: iu.length, type: "SCALAR" });
      prims.push({ attributes: attrs, indices: j.accessors.length - 1, ...(g.material !== undefined ? { material: g.material } : {}) });
    }
    j.meshes = [{ name: "merged", primitives: prims }];
    j.nodes = [{ name: "merged", mesh: 0 }];
    j.scenes = [{ nodes: [0] }]; j.scene = 0;
    delete j.cameras;
    console.log(`merged into ${prims.length} pieces`);
  }

  // ---- meshes ----
  let trisIn = 0, trisOut = 0;
  if (RATIO < 1 || DROP_TAN) await MeshoptSimplifier.ready;
  for (const mesh of j.meshes || []) for (const p of mesh.primitives) {
    if (DROP_TAN) delete p.attributes.TANGENT;
    if ((p.mode ?? 4) !== 4 || p.targets) continue;
    const pa = j.accessors[p.attributes.POSITION];
    const accs = Object.values(p.attributes).map((k) => j.accessors[k]);
    if (pa.componentType !== 5126 || accs.some((a) => a.sparse || a.bufferView === undefined)) continue;
    const n = pa.count;
    let idx;
    if (p.indices !== undefined) {
      const ia = j.accessors[p.indices], s = strideOf(ia), v = views[ia.bufferView];
      idx = new Uint32Array(ia.count);
      for (let i = 0; i < ia.count; i++) { const o = (ia.byteOffset || 0) + i * s; idx[i] = ia.componentType === 5125 ? v.readUInt32LE(o) : ia.componentType === 5123 ? v.readUInt16LE(o) : v[o]; }
    } else idx = Uint32Array.from({ length: n }, (_, i) => i);
    trisIn += idx.length / 3;
    if (RATIO < 1 && idx.length / 3 > MIN_TRIS) {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const e = elem(pa, i); pos[i * 3] = e.readFloatLE(0); pos[i * 3 + 1] = e.readFloatLE(4); pos[i * 3 + 2] = e.readFloatLE(8); }
      const target = Math.max(3, Math.floor((idx.length * RATIO) / 3) * 3);
      const [out] = MeshoptSimplifier.simplify(idx, pos, 3, target, ERR);
      if (out.length >= 3) idx = out;
    }
    trisOut += idx.length / 3;
    // keep only the vertices still used, every attribute packed tight
    const remap = new Int32Array(n).fill(-1), used = [];
    for (let i = 0; i < idx.length; i++) { const v = idx[i]; if (remap[v] < 0) { remap[v] = used.length; used.push(v); } idx[i] = remap[v]; }
    for (const [name, k] of Object.entries(p.attributes)) {
      const a = j.accessors[k], es = SIZE[a.componentType] * COMP[a.type];
      const buf = Buffer.alloc(used.length * es);
      used.forEach((v, i) => elem(a, v).copy(buf, i * es));
      const na = { bufferView: newView(buf, 34962), componentType: a.componentType, count: used.length, type: a.type, ...(a.normalized ? { normalized: true } : {}) };
      if (name === "POSITION") {
        const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < used.length; i++) for (let c = 0; c < 3; c++) { const x = buf.readFloatLE(i * 12 + c * 4); mn[c] = Math.min(mn[c], x); mx[c] = Math.max(mx[c], x); }
        na.min = mn; na.max = mx;
      }
      j.accessors.push(na); p.attributes[name] = j.accessors.length - 1;
    }
    const big = used.length > 65535, ib = Buffer.alloc(idx.length * (big ? 4 : 2));
    idx.forEach((v, i) => (big ? ib.writeUInt32LE(v, i * 4) : ib.writeUInt16LE(v, i * 2)));
    j.accessors.push({ bufferView: newView(ib, 34963), componentType: big ? 5125 : 5123, count: idx.length, type: "SCALAR" });
    p.indices = j.accessors.length - 1;
  }

  // ---- textures ----
  if (TEX > 0) {
    for (const im of j.images || []) {
      if (im.bufferView === undefined) continue;
      views[im.bufferView] = await sharp(views[im.bufferView]).resize({ width: TEX, height: TEX, fit: "inside", withoutEnlargement: true }).webp({ quality: 78, alphaQuality: 80 }).toBuffer();
      im.mimeType = "image/webp";
    }
    for (const t of j.textures || []) if (t.source !== undefined) { t.extensions = { ...(t.extensions || {}), EXT_texture_webp: { source: t.source } }; delete t.source; }
    if ((j.images || []).length) {
      j.extensionsUsed = [...new Set([...(j.extensionsUsed || []), "EXT_texture_webp"])];
      j.extensionsRequired = [...new Set([...(j.extensionsRequired || []), "EXT_texture_webp"])];
    }
  }

  // ---- drop what nothing uses any more, renumber, write ----
  const usedAcc = new Set();
  for (const m of j.meshes || []) for (const p of m.primitives) {
    Object.values(p.attributes).forEach((k) => usedAcc.add(k));
    if (p.indices !== undefined) usedAcc.add(p.indices);
    for (const t of p.targets || []) Object.values(t).forEach((k) => usedAcc.add(k));
  }
  for (const s of j.skins || []) if (s.inverseBindMatrices !== undefined) usedAcc.add(s.inverseBindMatrices);
  for (const an of j.animations || []) for (const s of an.samplers) { usedAcc.add(s.input); usedAcc.add(s.output); }
  const accMap = new Map(), accs = [];
  j.accessors.forEach((a, i) => { if (usedAcc.has(i)) { accMap.set(i, accs.length); accs.push(a); } });
  const usedView = new Set(accs.map((a) => a.bufferView).filter((v) => v !== undefined));
  for (const a of accs) if (a.sparse) { usedView.add(a.sparse.indices.bufferView); usedView.add(a.sparse.values.bufferView); }
  for (const im of j.images || []) if (im.bufferView !== undefined) usedView.add(im.bufferView);
  const viewMap = new Map(), bvs = [], parts = [];
  let off = 0;
  j.bufferViews.forEach((bv, i) => {
    if (!usedView.has(i)) return;
    const pad = (4 - (off % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
    viewMap.set(i, bvs.length);
    bvs.push({ ...bv, buffer: 0, byteOffset: off, byteLength: views[i].length });
    parts.push(views[i]); off += views[i].length;
  });
  for (const a of accs) {
    if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView);
    if (a.sparse) { a.sparse.indices.bufferView = viewMap.get(a.sparse.indices.bufferView); a.sparse.values.bufferView = viewMap.get(a.sparse.values.bufferView); }
  }
  for (const im of j.images || []) if (im.bufferView !== undefined) im.bufferView = viewMap.get(im.bufferView);
  for (const m of j.meshes || []) for (const p of m.primitives) {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]);
    if (p.indices !== undefined) p.indices = accMap.get(p.indices);
    for (const t of p.targets || []) for (const k of Object.keys(t)) t[k] = accMap.get(t[k]);
  }
  for (const s of j.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = accMap.get(s.inverseBindMatrices);
  for (const an of j.animations || []) for (const s of an.samplers) { s.input = accMap.get(s.input); s.output = accMap.get(s.output); }
  j.accessors = accs; j.bufferViews = bvs;

  let newBin = Buffer.concat(parts);
  if (newBin.length % 4) newBin = Buffer.concat([newBin, Buffer.alloc(4 - (newBin.length % 4))]);
  j.buffers = [{ byteLength: newBin.length }];
  let js = Buffer.from(JSON.stringify(j));
  if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + newBin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(newBin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(dst, Buffer.concat([head, jh, js, bh, newBin]));
  console.log(`${(b.length / 1e6).toFixed(1)} MB → ${(fs.statSync(dst).size / 1e6).toFixed(1)} MB` + (RATIO < 1 ? `, ${Math.round(trisIn)} → ${Math.round(trisOut)} triangles` : ""));
})();
