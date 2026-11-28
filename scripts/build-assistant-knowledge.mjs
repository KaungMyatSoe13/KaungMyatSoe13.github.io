// Builds the "Ask K" assistant's profile (worker/src/knowledge.md) from the site's own content
// plus src/content/assistant-facts.md. Run after changing any of them, then redeploy the Worker:
//   npm run knowledge
// Node 23.6+ reads the .ts content files directly (they have no imports).
import { readFileSync, writeFileSync } from "node:fs";
import { site } from "../src/content/site.ts";
import { aboutIntro, experience, skills } from "../src/content/about.ts";
import { projects } from "../src/content/projects.ts";
import { stack } from "../src/content/stack.ts";

const root = new URL("..", import.meta.url);
// unconfirmed drafts never reach the bot: a TODO item is skipped with its wrapped lines
let inTodo = false;
const facts = readFileSync(new URL("src/content/assistant-facts.md", root), "utf8")
  .split("\n")
  .filter((l) => {
    if (/^\s*-?\s*TODO\b/.test(l)) { inTodo = true; return false; }
    if (inTodo && /^\s{2,}\S/.test(l)) return false;           // its continuation lines
    inTodo = false;
    return true;
  })
  .join("\n")
  .replace(/^# Extra facts[\s\S]*?(?=^## )/m, "");     // drop the file's own instructions

const out = [];
out.push(`# Profile: ${site.name}`);
out.push(`- Also known as: K`);
out.push(`- Role: ${site.role}`);
out.push(`- Based in: ${site.location}`);
out.push(`- Website: ${site.url}`);
out.push(`- Email: ${site.email}`);
if (site.resume) out.push(`- Résumé (PDF): ${site.url}${site.resume}`);
for (const s of site.socials) out.push(`- ${s.label}: ${s.href}`);

out.push(`\n## About (from his About page)`);
for (const b of aboutIntro.body) out.push(`- ${b}`);

out.push(`\n## Career timeline`);
for (const e of experience) out.push(`- ${e.year}${e.now ? " (now)" : ""}: ${e.title}, ${e.where}. ${e.detail}`);

out.push(`\n## How he works`);
for (const s of skills) out.push(`- ${s.name}: ${s.tagline} ${s.body}`);

out.push(`\n## Main tech stack`);
out.push(`- ${stack.map((t) => t.name).join(", ")} (the first ones are what he leads with).`);

out.push(`\n## Projects on his site`);
for (const p of projects) {
  out.push(`### ${p.name} (${p.type}, ${p.year})`);
  out.push(`- ${p.summary}`);
  out.push(`- Built with: ${p.stack.join(", ")}`);
  if (p.role?.length) out.push(`- His part: ${p.role.join(", ")}`);
  if (p.links?.live) out.push(`- Live: ${p.links.live}`);
  if (p.links?.code) out.push(`- Code: ${p.links.code}`);
  out.push(`- Page on his site: ${site.url}/projects/${p.slug}/`);
}

out.push(`\n${facts.trim()}`);
const text = out.join("\n") + "\n";
writeFileSync(new URL("worker/src/knowledge.md", root), text);
console.log(`worker/src/knowledge.md: ${text.length} characters (~${Math.round(text.length / 4)} tokens)`);
