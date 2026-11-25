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
  /** Optional full-screen background image for the project page (CRT / B&W look). */
  scene?: string;
  /** Optional 3D place behind the project page instead (shown in colour; `scene` stays as
   *  the stand-in while it loads). Keep the .glb small: see README (textures → 512 WebP). */
  scene3d?: {
    src: string;
    /** Camera position and where it looks (the model's own units). */
    eye: [number, number, number];
    look: [number, number, number];
    /** Field of view (degrees, default 55): wider shows more (the page's lens magnifies the middle). */
    fov?: number;
    /** Night haze (FogExp2 density in the model's units; 0 = none). Default 0.035. */
    fog?: number;
    /** Reflections from a soft studio environment (strength; for shiny, metal materials). */
    env?: number;
    /** Brightness (tone-mapping exposure, default 1.35): a bright place behind white text needs less. */
    exposure?: number;
    /** The model's licence credit, shown on the page. */
    credit: { title: string; titleUrl: string; author: string; authorUrl: string; license: string; licenseUrl: string };
  };
  /** More screenshots for the project page (the cover is shown first). */
  gallery?: string[];
  /** What you did on it, one item per line. */
  role?: string[];
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
    gallery: ["/projects/kotobalab/g1.webp", "/projects/kotobalab/g2.webp"],
    role: ["Design", "Full-stack development"],
    preview: "/projects/kotobalab/preview.mp4",
    scene: "/projects/kotobalab/shrine-photo.webp",
    scene3d: {
      src: "/projects/kotobalab/street.glb",
      eye: [0.44, 1.3, -0.3],
      look: [0.44, 1.25, -10],
      credit: {
        title: "Japanese street at night", titleUrl: "https://sketchfab.com/3d-models/japanese-street-at-night-fb1bdcd71a5544d699379d2d13dd1171",
        author: "AFX/CGMotion 3DModel Maker", authorUrl: "https://sketchfab.com/afx_cgmotion",
        license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      },
    },
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
    scene3d: {
      src: "/projects/shopshop/seven-eleven.glb",
      eye: [60, 85, -5],
      look: [-60, 50, -170],
      fov: 70,
      fog: 0.002,
      exposure: 0.95,
      credit: {
        title: "7 eleven", titleUrl: "https://sketchfab.com/3d-models/7-eleven-7b73409d2deb4adcb2086a8b7d0ab58a",
        author: "Pasha-", authorUrl: "https://sketchfab.com/Pasha-",
        license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      },
    },
    gallery: ["/projects/shopshop/g1.webp", "/projects/shopshop/g2.webp", "/projects/shopshop/g3.webp", "/projects/shopshop/g4.webp", "/projects/shopshop/g5.webp"],
    role: ["Full-stack development", "Admin dashboard"],
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
    scene3d: {
      src: "/projects/myanglish/old-office.glb",
      eye: [-0.5, 1.3, 3.4],
      look: [-0.5, 1.1, -4.2],
      fov: 70,
      fog: 0.03,
      credit: {
        title: "office is old abandoned FREE", titleUrl: "https://sketchfab.com/3d-models/office-is-old-abandoned-free-3977a108b2304b85a698f3dda1777015",
        author: "dasy444", authorUrl: "https://sketchfab.com/dasy444",
        license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      },
    },
    gallery: ["/projects/myanglish/g1.webp", "/projects/myanglish/g2.webp"],
    role: ["Frontend development"],
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
    scene3d: {
      src: "/projects/peakfit/gym.glb",
      eye: [-0.5, 1.8, 6.5],
      look: [-0.5, 2.1, -7.3],
      fov: 68,
      fog: 0.02,
      credit: {
        title: "Training Gym", titleUrl: "https://sketchfab.com/3d-models/training-gym-574d0be459164655824740ba2adf37fd",
        author: "local.yany", authorUrl: "https://sketchfab.com/local.yany",
        license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      },
    },
    gallery: ["/projects/peakfit/g1.webp", "/projects/peakfit/g2.webp", "/projects/peakfit/g3.webp"],
    role: ["App development", "Admin dashboard"],
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
    scene3d: {
      src: "/projects/emoface/matrix.glb",
      eye: [0, -3.2, 15],
      look: [0, -3.2, -18.7],
      fov: 62,
      fog: 0.02,
      env: 0.8,
      credit: {
        title: "matrix 2005 scena", titleUrl: "https://sketchfab.com/3d-models/matrix-2005-scena-d660cbfc841d48a0b0eb3f511df2f542",
        author: "neosearch", authorUrl: "https://sketchfab.com/neosearch",
        license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      },
    },
    gallery: ["/projects/emoface/g1.webp", "/projects/emoface/g2.webp", "/projects/emoface/g3.webp"],
    role: ["AI / ML development"],
    links: {
      code: "https://github.com/APS4087/EMOFACE",
    },
  },
];
