import { colorTexture, createCanvas } from '../../lib/canvas';

const W = 96, H = 264;
const AMBER_DIM = 'rgba(255,175,95,.5)';

/** The climate panel's printed face beside the radio: rings, labels and the temperature slot, behind the real knobs, lever and button. */
export function createClimate() {
  const { canvas, ctx: g } = createCanvas(W, H);
  const texture = colorTexture(canvas);
  const { canvas: buttonCanvas, ctx: b } = createCanvas(120, 56);
  const buttonTexture = colorTexture(buttonCanvas);
  /** The printed ring and label round a knob; the knob itself is a real part in front. */
  const knob = (y: number, label: string): void => {
    g.strokeStyle = AMBER_DIM;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(W / 2, y, 20, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = AMBER_DIM;
    g.font = '10px Inter, sans-serif';
    g.textAlign = 'center';
    g.fillText(label, W / 2, y + 34);
  };
  return {
    texture,
    /** The A/C button's label, printed on its cap: lit amber when on. */
    drawButton(airCon: boolean): void {
      b.fillStyle = '#000';
      b.fillRect(0, 0, 120, 56);
      b.fillStyle = airCon ? '#ffbe78' : 'rgba(255,175,95,.45)';
      b.font = '600 30px Inter, sans-serif';
      b.textAlign = 'center';
      b.textBaseline = 'middle';
      b.fillText('A/C', 60, 30);
      buttonTexture.needsUpdate = true;
    },
    buttonTexture,
    draw(): void {
      g.fillStyle = '#040405';
      g.fillRect(0, 0, W, H);
      knob(32, 'FAN');
      // Temperature: a blue-to-red slider, set a little warm.
      const grad = g.createLinearGradient(14, 0, W - 14, 0);
      grad.addColorStop(0, '#3a6fd8');
      grad.addColorStop(1, '#d8452e');
      g.fillStyle = grad;
      g.fillRect(14, 104, W - 28, 6);
      g.fillStyle = AMBER_DIM;
      g.fillText('TEMP', W / 2, 132);
      knob(170, 'AIR');
      texture.needsUpdate = true;
    }
  };
}
