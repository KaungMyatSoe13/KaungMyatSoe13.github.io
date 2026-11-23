/*
 * A small 3D Japanese room built with CSS 3D (no images): tatami floor, glowing shoji
 * paper wall with wooden lattice ahead, fusuma doors on the sides, a wooden ceiling.
 * It sits behind a project page; the page's --mx / --my (pointer, -1..1) turn the view,
 * so moving the mouse left swings the room to the right.
 */
export default function JapaneseRoom() {
  return (
    <div className="jr" aria-hidden="true">
      <div className="jr__scene">
        <div className="jr__face jr__back" />
        <div className="jr__face jr__floor" />
        <div className="jr__face jr__ceil" />
        <div className="jr__face jr__left" />
        <div className="jr__face jr__right" />
        <div className="jr__table">
          <div className="jr__table-top" />
          <div className="jr__table-front" />
        </div>
      </div>
      <div className="jr__light" />
    </div>
  );
}
