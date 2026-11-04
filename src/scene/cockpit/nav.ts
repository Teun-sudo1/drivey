import { colorTexture, createCanvas } from '../../lib/canvas';

/** A wide screen: the map drawn at 200 by 300 on the left, scaled to fit, and the route alongside. */
const W = 330, H = 200, MAP = H / 300;

export function createNav() {
  const { canvas, ctx: g } = createCanvas(W, H);
  const texture = colorTexture(canvas);
  /** The right-hand panel: the route's name, and what the road does next. */
  const panel = (routeName: string, hint: string): void => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b0e16';
    g.fillRect(200 * MAP, 0, W - 200 * MAP, H);
    g.fillStyle = 'rgba(120,130,150,.35)';
    g.fillRect(200 * MAP, 0, 2, H);
    g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.font = '600 17px Inter, sans-serif';
    g.fillText(routeName, 200 * MAP + 14, 42, W - 200 * MAP - 24);
    g.fillStyle = '#ff9a3c';
    g.font = '500 15px Inter, sans-serif';
    g.fillText(hint, 200 * MAP + 14, 80);
  };
  return {
    texture,
    draw(offset: number, curve: number, routeName: string): void {
      g.setTransform(MAP, 0, 0, MAP, 0, 0);
      g.fillStyle = '#0b0e16';
      g.fillRect(0, 0, 200, 300);
      g.strokeStyle = 'rgba(120,130,150,.35)';
      g.lineWidth = 3;
      for (let i = -2; i < 8; i++) {
        const y = ((i * 50 + offset) % 400) - 50;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(200, y + 20);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(40, 0);
      g.lineTo(60, 300);
      g.moveTo(160, 0);
      g.lineTo(150, 300);
      g.stroke();
      g.strokeStyle = '#ff9a3c';
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(100, 300);
      g.bezierCurveTo(100, 220, 100 + curve * 3000, 120, 100 + curve * 6000, 0);
      g.stroke();
      g.fillStyle = '#5aa0ff';
      g.beginPath();
      g.moveTo(100, 228);
      g.lineTo(90, 252);
      g.lineTo(100, 246);
      g.lineTo(110, 252);
      g.fill();
      panel(routeName, Math.abs(curve) < 0.00004 ? 'Straight on' : curve > 0 ? 'Bear right' : 'Bear left');
      texture.needsUpdate = true;
    },

    /** While the driver settles in: the unit boots and plans the route, a bar sweeping under a turning dial. */
    drawLoading(t: number, routeName: string): void {
      g.setTransform(MAP, 0, 0, MAP, 0, 0);
      g.fillStyle = '#0b0e16';
      g.fillRect(0, 0, 200, 300);
      // A ring of ticks, the brightest one going round.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, lit = (i - Math.floor(t * 12) + 12) % 12;
        g.strokeStyle = `rgba(255,154,60,${0.15 + 0.85 * (1 - lit / 12) ** 2})`;
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(100 + Math.cos(a) * 26, 130 + Math.sin(a) * 26);
        g.lineTo(100 + Math.cos(a) * 40, 130 + Math.sin(a) * 40);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,.6)';
      g.font = '500 13px Inter, sans-serif';
      g.textAlign = 'center';
      g.fillText('Planning route' + '.'.repeat(Math.floor(t * 2) % 4), 100, 205);
      g.fillStyle = 'rgba(120,130,150,.3)';
      g.fillRect(30, 225, 140, 6);
      const sweep = (t * 0.6) % 1.3;
      g.fillStyle = '#ff9a3c';
      g.fillRect(30 + Math.max(0, sweep - 0.3) * 140, 225, Math.max(0, Math.min(sweep, 1) - Math.max(0, sweep - 0.3)) * 140, 6);
      panel(routeName, 'Starting up');
      texture.needsUpdate = true;
    }
  };
}
