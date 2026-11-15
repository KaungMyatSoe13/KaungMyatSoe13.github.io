/**
 * Your projects. The list on the home page is built from this array, top to bottom.
 *
 * To add a project:
 *   1. Make a folder: public/projects/<slug>/
 *   2. Put a cover image in it (cover.webp, ~1200px wide) and, optionally, a short
 *      muted clip (preview.mp4, 5-8 s, 720px wide) for the hover preview.
 *   3. Add an entry below. Only `slug`, `name`, `type`, `year` and `cover` are required.
 */
export type Project = {
  /** Folder name under public/projects/, lowercase, no spaces. Also the future page URL. */
  slug: string;
  name: string;
  /** One short line: what it is. */
  summary: string;
  /** Shown as the small tag next to the name, e.g. "Web", "Mobile", "AI". */
  type: string;
  year: string;
  stack: string[];
  cover: string;
  /** Optional short muted clip played on hover. */
  preview?: string;
  links?: {
    live?: string;
    code?: string;
  };
};

export const projects: Project[] = [
  {
    slug: "kotobalab",
    name: "KotobaLab",
    summary: "Japanese vocabulary trainer with lessons, quizzes and audio.",
    type: "Web",
    year: "2025",
    stack: ["Next.js", "TypeScript", "Firebase"],
    cover: "/projects/kotobalab/cover.webp",
    preview: "/projects/kotobalab/preview.mp4",
    links: {
      live: "https://kotoba-lab.vercel.app",
      code: "https://github.com/KaungMyatSoe13/KotobaLab",
    },
  },
  {
    slug: "shopshop",
    name: "ShopShop",
    summary: "Online store with order tracking and an admin dashboard.",
    type: "Web",
    year: "2025",
    stack: ["MongoDB", "Express", "React", "Node", "Cloudinary"],
    cover: "/projects/shopshop/cover.webp",
    preview: "/projects/shopshop/preview.mp4",
    links: {
      live: "https://shop-shop-pied.vercel.app",
      code: "https://github.com/KaungMyatSoe13/ShopShop",
    },
  },
  {
    slug: "myanglish",
    name: "Myanglish Translator",
    summary: "Turns romanised Burmese into Burmese script as you type.",
    type: "Web",
    year: "2025",
    stack: ["React", "Tailwind CSS"],
    cover: "/projects/myanglish/cover.webp",
    preview: "/projects/myanglish/preview.mp4",
    links: {
      live: "https://myanglish-translator-peach.vercel.app",
      code: "https://github.com/KaungMyatSoe13/myanglish-translator",
    },
  },
  {
    slug: "peakfit",
    name: "PeakFit",
    summary: "Fitness app with workout plans, progress tracking and an admin panel.",
    type: "Mobile",
    year: "2024",
    stack: ["React Native", "TypeScript", "Firebase"],
    cover: "/projects/peakfit/cover.webp",
    preview: "/projects/peakfit/preview.mp4",
  },
  {
    slug: "emoface",
    name: "EmoFace",
    summary: "Reads emotions from faces with a deep-learning model.",
    type: "AI",
    year: "2024",
    stack: ["Python", "TensorFlow", "PyTorch", "OpenCV"],
    cover: "/projects/emoface/cover.webp",
    links: {
      code: "https://github.com/APS4087/EMOFACE",
    },
  },
];
