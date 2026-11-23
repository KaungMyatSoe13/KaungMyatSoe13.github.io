/**
 * A still of the home showcase, taken at the moment a project is clicked. It lives in
 * memory for the visit (client-side navigation keeps it). The project page shows it
 * around the clicked screen while its room grows out from behind that screen, and shows
 * it again while the room shrinks back on close; the home page shows it until its own
 * first frame. So nothing ever flashes between the two pages.
 */
let shot: string | null = null;
let mouse: [number, number] = [0, 0];

export const setHomeShot = (url: string, mx: number, my: number) => { shot = url; mouse = [mx, my]; };
export const homeShot = () => shot;
export const homeShotMouse = () => mouse;
