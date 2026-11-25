/**
 * About page content. Facts come from the CV (public/files/KaungMyatSoe_CV.pdf); edit freely.
 */
export const aboutIntro = {
  label: "About",
  name: "Kaung Myat Soe,",
  alias: "Aka K,", // the title glitches between `name` and this
  role: "a full-stack developer.",
  body: [
    "22, based in Singapore, and I build for the web with modern frameworks: React, Next.js, TypeScript and Node, from the interface all the way to the API and the database.",
    "I also build WordPress, Elementor and Shopify sites, custom plugins included, and I love learning AI, machine learning and deep learning. Always shipping, always learning.",
  ],
  // placeholder photo with the background cut out (transparent PNG); the original is me.jpg
  photo: "/about/me2-cut.webp",
};

export type Experience = { year: string; title: string; where: string; detail: string; now?: boolean };

/** Career timeline, oldest first. The big particle year follows the entry in view. */
export const experience: Experience[] = [
  {
    year: "2023",
    title: "Diploma in Information Technology",
    where: "Singapore Institute of Management",
    detail: "Graduated April 2023. Where the coding bug bit, hard.",
  },
  {
    year: "2025",
    title: "Bachelor of Computer Science, Big Data",
    where: "University of Wollongong",
    detail: "Graduated March 2025. Data, AI and a lot of late-night builds.",
  },
  {
    year: "2025",
    title: "Freelance Web Developer",
    where: "Self-employed · 10 months",
    detail: "Straight out of uni: websites and apps for my own clients, from the first call to going live.",
  },
  {
    year: "2026",
    title: "Web Developer",
    where: "Marketing agency, Singapore",
    detail: "WordPress, Elementor and Shopify sites built from scratch to launch. Lots of plugins, a few custom ones of my own, and I deploy them live myself.",
    now: true,
  },
];

/** "What I do": one screen each; the portrait's particles build each step's icon. */
export type SkillIcon = "discover" | "design" | "architect" | "build" | "launch" | "maintain";
export type Skill = { name: string; tagline: string; body: string; icon: SkillIcon };
export const skills: Skill[] = [
  { name: "Discover", tagline: "Start with the right questions.", body: "Understanding the people, the goals and the problem before a single pixel or line of code.", icon: "discover" },
  { name: "Design", tagline: "From the first sketch.", body: "Wireframes to polished UI: layouts, type and colour that work on every screen size.", icon: "design" },
  { name: "Architect", tagline: "Plan the parts before building them.", body: "Choosing the stack and shaping the system: frontend, APIs, data and auth, built to grow.", icon: "architect" },
  { name: "Build", tagline: "Turning plans into working software.", body: "Full-stack apps with React, Next.js, TypeScript and Node, plus WordPress, Elementor and Shopify sites with custom plugins.", icon: "build" },
  { name: "Launch", tagline: "Getting it into people's hands.", body: "Going live with fast loading, clean SEO and nothing left broken.", icon: "launch" },
  { name: "Maintain", tagline: "Keeping it healthy after launch.", body: "Fixes, updates and improvements, so the product keeps working as it grows.", icon: "maintain" },
];

/** "After hours" (the last section): channels on the old TV, one per hobby. */
export type HobbyShape = "ball" | "pad" | "note" | "code";
export const afterHours = {
  title: "After hours",
  note: "When the laptop closes",
  hobbies: [
    { name: "Football", line: "Out on the pitch whenever there's a game on.", shape: "ball" as HobbyShape },
    { name: "Game", line: "When there isn't, the same game on a controller.", shape: "pad" as HobbyShape },
    { name: "Music", line: "Playing it, not just listening to it.", shape: "note" as HobbyShape },
    { name: "Coding", line: "Side projects and new tools, just for the fun of it.", shape: "code" as HobbyShape },
  ],
};

/** (05) Contact: the form sends through your mail app (the site is static, no server). */
export const contact = {
  title: "Let's talk",
  note: "Projects, roles or a quick question",
  body: "Tell me what you're building. The message opens in your mail app, ready to send.",
  /** The TV models (the falling TV turns into the others) are CC BY 4.0: these credits must stay on the page. */
  credits: [
    { title: "vintage old TV", titleUrl: "https://sketchfab.com/3d-models/vintage-old-tv-21cfca2b5a0849e4b33dd3ef1f8d998b", author: "FArHAn's 3D worKs", authorUrl: "https://sketchfab.com/ThEpyThonISdEad" },
    { title: "Television", titleUrl: "https://sketchfab.com/3d-models/television-a66ef2d7637c44018dc0f7fd85b2a95d", author: "defiat11", authorUrl: "https://sketchfab.com/defiat11" },
    { title: "Old TV - Vintage Style", titleUrl: "https://sketchfab.com/3d-models/old-tv-vintage-style-d5f983d05f0d4715a71179883d741605", author: "Elliot_Lisenkov", authorUrl: "https://sketchfab.com/elliotfox" },
    { title: "TV Retro White", titleUrl: "https://sketchfab.com/3d-models/tv-retro-white-056d9b939742424db19aea4adda94e6e", author: "Lukas Bobor", authorUrl: "https://sketchfab.com/LukasBobor" },
  ],
};
