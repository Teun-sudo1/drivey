import { colorTexture, createCanvas } from '../../lib/canvas';

export function createLcd() {
  const { canvas, ctx: g } = createCanvas(320, 80);
  const texture = colorTexture(canvas);
  return {
    texture,
    draw(txt: string, label: string): void {
      const gr = g.createLinearGradient(0, 0, 0, 80);
      gr.addColorStop(0, '#0a1d5e');
      gr.addColorStop(1, '#05103a');
      g.fillStyle = gr;
      g.fillRect(0, 0, 320, 80);
      g.fillStyle = 'rgba(120,170,255,.12)';
      g.font = '700 54px "Share Tech Mono", monospace';
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.fillText('88:88', 306, 44);
      g.save();
      g.shadowColor = '#4d8bff';
      g.shadowBlur = 14;
      g.fillStyle = '#8fb7ff';
      g.fillText(txt, 306, 44);
      g.restore();
      g.textAlign = 'left';
      g.font = '600 14px Inter, sans-serif';
      g.fillStyle = '#ff5a3a';
      g.fillText(label, 12, 22);
      g.fillStyle = 'rgba(143,183,255,.7)';
      g.font = '12px "Share Tech Mono", monospace';
      g.fillText('NIGHT DRIVE', 12, 60);
      texture.needsUpdate = true;
    }
  };
}
