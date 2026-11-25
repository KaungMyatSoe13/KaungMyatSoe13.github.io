/**
 * What the first page load is waiting for, so the loading counter (`Loader.tsx`) shows real
 * progress and the page is ready behind it when it goes. Components add their heavy work
 * (3D models, images, the first rendered frame); each reports 0..1. Only the first load of a
 * visit has a counter; later page changes don't wait for anything.
 */
type Task = { weight: number; done: number };

const tasks = new Map<string, Task>();
let finished = false;

export const loading = {
  /** A piece of work worth `weight`; call the returned function with 0..1 as it goes. */
  add(key: string, weight = 1) {
    if (finished) return () => {};
    if (!tasks.has(key)) tasks.set(key, { weight, done: 0 });
    return (f: number) => { const t = tasks.get(key); if (t) t.done = Math.max(t.done, Math.min(1, f)); };
  },
  /** A promise counts as one piece of work, done when it settles. */
  track<T>(key: string, p: Promise<T>, weight = 1) {
    const set = loading.add(key, weight);
    p.then(() => set(1), () => set(1));
    return p;
  },
  /** 0..1 over everything added so far. */
  progress() {
    let all = 0, done = 0;
    tasks.forEach((t) => { all += t.weight; done += t.weight * t.done; });
    return all ? done / all : 0;
  },
  allDone() { let ok = true; tasks.forEach((t) => { if (t.done < 1) ok = false; }); return ok; },
  count: () => tasks.size,
  isFinished: () => finished,
  finish() { finished = true; },
};

/** A three.js loader's onProgress → 0..1 (when the size is known). */
export const bytes = (set: (f: number) => void) => (e: ProgressEvent) => { if (e.lengthComputable && e.total) set(Math.min(0.95, e.loaded / e.total)); };
