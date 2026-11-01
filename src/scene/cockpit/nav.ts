import { colorTexture, createCanvas } from '../../lib/canvas';

export function createNav() {
  const { canvas, ctx: g } = createCanvas(200, 300);
  const texture = colorTexture(canvas);
  return {
    texture,
    draw(offset: number, curve: number, routeName: string): void {
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
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.font = '600 15px Inter, sans-serif';
      g.fillText(routeName, 10, 22);
      texture.needsUpdate = true;
    }
  };
}
