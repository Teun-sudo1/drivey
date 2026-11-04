import { colorTexture, createCanvas } from '../../lib/canvas';

/** The two shapes of the timer display: wide under the radio, or squarer beside it on a phone. */
const WIDE = { w: 320, h: 80 }, COMPACT = { w: 240, h: 120 };

/** The timer's display, in the radio's amber: barely glowing segments over the faint ghost of unlit ones. */
export function createLcd() {
  const wide = createCanvas(WIDE.w, WIDE.h), compact = createCanvas(COMPACT.w, COMPACT.h);
  const textures = { wide: colorTexture(wide.canvas), compact: colorTexture(compact.canvas) };

  const paint = (g: CanvasRenderingContext2D, w: number, h: number, txt: string, label: string, stacked: boolean): void => {
    g.fillStyle = '#040405';
    g.fillRect(0, 0, w, h);
    const size = stacked ? 58 : 54, digitsX = stacked ? w / 2 : w - 14, digitsY = stacked ? h * 0.62 : h * 0.53;
    g.font = `700 ${size}px "Share Tech Mono", monospace`;
    g.textAlign = stacked ? 'center' : 'right';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,165,80,.07)';
    g.fillText('88:88', digitsX, digitsY);
    g.save();
    g.shadowColor = 'rgba(255,122,26,.3)';
    g.shadowBlur = 2;
    // The same orange as the PAUSED label above it.
    g.fillStyle = '#ff8c32';
    g.fillText(txt, digitsX, digitsY);
    g.restore();
    g.textAlign = stacked ? 'center' : 'left';
    g.font = '600 14px Inter, sans-serif';
    g.fillStyle = '#ff8c32';
    g.fillText(label, stacked ? w / 2 : 12, stacked ? 20 : 24);
    if (!stacked) {
      g.fillStyle = 'rgba(255,175,95,.45)';
      g.font = '12px "Share Tech Mono", monospace';
      g.fillText('TIMER', 12, 58);
    }
  };

  return {
    textures,
    draw(txt: string, label: string): void {
      paint(wide.ctx, WIDE.w, WIDE.h, txt, label, false);
      paint(compact.ctx, COMPACT.w, COMPACT.h, txt, label, true);
      textures.wide.needsUpdate = textures.compact.needsUpdate = true;
    }
  };
}
