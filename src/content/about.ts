/**
 * About page content. Facts come from the CV (public/files/KaungMyatSoe_CV.pdf); edit freely.
 */
export const aboutIntro = {
  label: "About",
  name: "I'm Kaung Myat Soe,",
  alias: "Aka K,", // the title glitches between `name` and this
  role: "a full-stack developer.",
  body: [
    "I studied computer science with a focus on big data at the University of Wollongong, after a diploma in IT at the Singapore Institute of Management.",
    "I build web and mobile apps end to end, from the interface to the database, and I like machine learning work: computer vision, emotion recognition and NLP.",
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
    detail: "Graduated April 2023.",
  },
  {
    year: "2024",
    title: "PeakFit fitness app",
    where: "React Native · TypeScript · Firebase",
    detail: "Cross-platform app with workout plans, live tracking and an admin dashboard.",
  },
  {
    year: "2024",
    title: "Machine learning projects",
    where: "TensorFlow · PyTorch · DistilBERT · OpenCV",
    detail: "Face and emotion recognition with transfer learning, sentiment analysis, and vehicle detection.",
  },
  {
    year: "2025",
    title: "Bachelor of Computer Science, Big Data",
    where: "University of Wollongong",
    detail: "Graduated March 2025.",
  },
  {
    year: "2025",
    title: "ShopShop, Myanglish Translator, KotobaLab",
    where: "MERN · React · Next.js · Firebase",
    detail: "An online store with admin dashboards, a Burmese script translator, and a Japanese vocabulary trainer.",
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
  { name: "Build", tagline: "Turning plans into working software.", body: "Full-stack web and mobile apps with React, Next.js, Node and React Native, plus ML where it helps.", icon: "build" },
  { name: "Launch", tagline: "Getting it into people's hands.", body: "Deploying to Vercel and the cloud, with fast loading, clean SEO and nothing left broken.", icon: "launch" },
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
  /** The TV model is CC BY 4.0: this credit must stay on the page. */
  credit: {
    title: "vintage old TV",
    titleUrl: "https://sketchfab.com/3d-models/vintage-old-tv-21cfca2b5a0849e4b33dd3ef1f8d998b",
    author: "FArHAn's 3D worKs",
    authorUrl: "https://sketchfab.com/ThEpyThonISdEad",
  },
};
