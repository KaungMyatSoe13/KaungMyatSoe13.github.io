/**
 * Site-wide info. Edit this file to change your name, role, links or résumé.
 * Nothing else in the code needs to change.
 */
export const site = {
  name: "Kaung Myat Soe",
  role: "Full-stack developer",
  location: "Singapore",
  /** One short line under the project list. Keep it under ~12 words. */
  intro: "Web, mobile and machine-learning projects I designed and built.",
  url: "https://k-the.dev",
  email: "kaungsoe132004@gmail.com",
  /** The résumé PDF. Empty = every Résumé link is hidden (owner, 2026-11-28: the CV is out of date;
   *  put "/files/KaungMyatSoe_CV.pdf" back once it is updated, then `npm run knowledge`). */
  resume: "" as string,
  socials: [
    { label: "GitHub", href: "https://github.com/KaungMyatSoe13" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/kforsure/" },
  ],
} as const;
