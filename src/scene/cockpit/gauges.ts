import { colorTexture, createCanvas } from '../../lib/canvas';
import { clamp } from '../../lib/math';

const W = 512, H = 168;

function dial(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, f: number, labels: string[], unit: string): void {
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  g.strokeStyle = 'rgba(255,165,80,.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, r, a0, a1);
  g.stroke();
  for (let i = 0; i <= 16; i++) {
    const a = a0 + ((a1 - a0) * i) / 16, l = i % 4 ? 6 : 12;
    g.strokeStyle = i % 4 ? 'rgba(255,175,95,.5)' : 'rgba(255,190,120,.95)';
    g.lineWidth = i % 4 ? 1.5 : 2.5;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
    g.lineTo(cx + Math.cos(a) * (r - 2 - l), cy + Math.sin(a) * (r - 2 - l));
    g.stroke();
  }
  g.fillStyle = 'rgba(255,195,130,.9)';
  g.font = '14px Inter, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  labels.forEach((t, i) => {
    const a = a0 + ((a1 - a0) * i) / 4;
    g.fillText(t, cx + Math.cos(a) * (r - 26), cy + Math.sin(a) * (r - 26));
  });
  g.font = '10px Inter, sans-serif';
  g.fillStyle = 'rgba(255,175,95,.55)';
  g.fillText(unit, cx, cy + 30);
  const a = a0 + (a1 - a0) * clamp(f, 0, 1);
  g.save();
  g.shadowColor = '#ff7a1a';
  g.shadowBlur = 12;
  g.strokeStyle = '#ff8c32';
  g.lineWidth = 3.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10);
  g.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
  g.stroke();
  g.restore();
  g.fillStyle = '#1a1a1c';
  g.beginPath();
  g.arc(cx, cy, 7, 0, Math.PI * 2);
  g.fill();
}

export function createGauges() {
  const { canvas, ctx: g } = createCanvas(W, H);
  const texture = colorTexture(canvas);
  return {
    texture,
    draw(kmh: number, rpm: number): void {
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#040405';
      g.fillRect(0, 0, W, H);
      dial(g, 150, 88, 74, kmh / 180, ['0', '40', '80', '120', '160'], 'km/h');
      dial(g, 362, 88, 74, rpm / 8, ['0', '2', '4', '6', '8'], 'x1000');
      g.fillStyle = 'rgba(255,170,90,.8)';
      g.font = '18px "Share Tech Mono", monospace';
      g.textAlign = 'center';
      g.fillText(String(Math.round(kmh)).padStart(3, ' '), 256, 150);
      texture.needsUpdate = true;
    }
  };
}
