import type { Engine, EngineState } from '../app/engine';

/** Key angles in degrees, matching the labels drawn on the barrel in index.html. */
const LOCK = -45;
const ACC = 0;
const ON = 45;
const START = 90;
/** How far the key must turn before the starter engages. */
const START_ZONE = 80;
/** How long the key must be held at START before the engine catches. */
const CRANK_SECONDS = 0.9;
const SPRING_SPEED = 300;
const AUTO_TURN_SPEED = 130;
/** Below this much turning a press counts as a tap, not a drag. */
const DRAG_THRESHOLD = 4;
const MAX_DT = 0.05;
/** Where the tag's ring hangs from, on the key's bow, as distance from the barrel's centre. */
const TAG_ANCHOR = 66;
const TAG_STIFFNESS = 26;
const TAG_DAMPING = 2.4;
/** How strongly the key's movement throws the tag sideways. */
const TAG_THROW = 0.018;
const TAG_REST = 0.05;

function stateAt(angle: number): EngineState {
  if (angle >= START_ZONE) return 'cranking';
  if (angle >= (ACC + ON) / 2) return 'on';
  if (angle >= (LOCK + ACC) / 2) return 'acc';
  return 'off';
}

/** Where a released key comes to rest: START is spring-loaded, like a real ignition. */
function restingAngle(angle: number): number {
  if (angle >= (ACC + ON) / 2) return ON;
  if (angle >= (LOCK + ACC) / 2) return ACC;
  return LOCK;
}

/**
 * The key: drag it round, or tap or press Enter to have it turned for you. Hold
 * it at START long enough and the engine catches; let go early and it springs
 * back to ON so you can try again.
 */
export function createIgnition(button: HTMLElement, keyBody: SVGElement, keyTag: SVGElement, engine: Engine): void {
  let angle = LOCK;
  let target = LOCK;
  let dragging = false;
  let autoTurning = false;
  let dragged = false;
  let grabOffset = 0;
  let crankTime = 0;
  let last = 0;
  let frame = 0;
  let tagSwing = 0;
  let tagVelocity = 0;

  const pointerAngle = (e: PointerEvent): number => {
    const box = button.getBoundingClientRect();
    return (Math.atan2(e.clientX - (box.left + box.width / 2), box.top + box.height / 2 - e.clientY) * 180) / Math.PI;
  };

  /** The tag hangs from the bow under gravity, and swings when the key moves. */
  function swingTag(dt: number, keySpeed: number): void {
    const reduced = document.body.classList.contains('reduced');
    tagVelocity += (-TAG_STIFFNESS * tagSwing - TAG_DAMPING * tagVelocity - keySpeed * TAG_THROW * TAG_STIFFNESS) * dt;
    tagSwing += tagVelocity * dt;
    const radians = (angle * Math.PI) / 180;
    const x = Math.sin(radians) * TAG_ANCHOR, y = -Math.cos(radians) * TAG_ANCHOR;
    keyTag.setAttribute('transform', `translate(${x} ${y}) rotate(${reduced ? 0 : (tagSwing * 180) / Math.PI})`);
  }

  function step(now: number): void {
    const dt = Math.max(0, Math.min(MAX_DT, (now - last) / 1000));
    last = now;
    const previous = angle;
    if (autoTurning) angle = Math.min(START, angle + AUTO_TURN_SPEED * dt);
    else if (!dragging) angle += Math.sign(target - angle) * Math.min(Math.abs(target - angle), SPRING_SPEED * dt);
    keyBody.style.transform = `rotate(${angle}deg)`;
    swingTag(dt, dt > 0 ? (angle - previous) / dt : 0);

    if (!engine.running) {
      const state = stateAt(angle);
      engine.set(state);
      crankTime = state === 'cranking' ? crankTime + dt : 0;
      if (crankTime >= CRANK_SECONDS) {
        engine.set('running');
        dragging = autoTurning = false;
        target = ON;
      }
    }
    const moving = dragging || autoTurning || angle !== target || Math.abs(tagSwing) + Math.abs(tagVelocity) > TAG_REST;
    frame = moving ? requestAnimationFrame(step) : 0;
  }

  function wake(): void {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  }

  swingTag(0, 0);

  button.addEventListener('pointerdown', e => {
    if (engine.running) return;
    button.setPointerCapture(e.pointerId);
    dragging = true;
    dragged = false;
    autoTurning = false;
    grabOffset = angle - pointerAngle(e);
    wake();
  });
  button.addEventListener('pointermove', e => {
    if (!dragging) return;
    // Wrapped, so crossing the bottom of the circle doesn't make the key jump.
    let next = pointerAngle(e) + grabOffset;
    while (next - angle > 180) next -= 360;
    while (next - angle < -180) next += 360;
    if (Math.abs(next - angle) > DRAG_THRESHOLD) dragged = true;
    angle = Math.max(LOCK, Math.min(START, next));
  });
  const release = (): void => {
    if (!dragging) return;
    dragging = false;
    target = restingAngle(angle);
    wake();
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  // Also what Enter and Space trigger, so the key works without a pointer.
  button.addEventListener('click', () => {
    if (dragged || engine.running) return;
    autoTurning = true;
    wake();
  });
}
