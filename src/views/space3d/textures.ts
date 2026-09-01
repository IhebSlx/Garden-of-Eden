/**
 * Canvas-drawn textures for the 3D scene, matching the prototype's
 * `glowTexture`, `labelSprite`, `ringTexture`, `tinyLabel` and `floorTexture`.
 *
 * SPEC 6 quality bar: label text sits in glass pills, halos are soft and additive,
 * and the scene is grounded on a light disc - none of it blown out.
 */
import { CanvasTexture, Color } from 'three';

function canvas(width: number, height: number): { element: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const ctx = element.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return { element, ctx };
}

/** Soft additive halo around a node. */
export function glowTexture(hex: number): CanvasTexture {
  const { element, ctx } = canvas(128, 128);
  const color = new Color(hex);
  const rgb = `${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0}`;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,.85)');
  gradient.addColorStop(0.28, `rgba(${rgb},.5)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(element);
}

/** The selection ring (SPEC 5.9) and the click burst (SPEC 5.9). */
export function ringTexture(): CanvasTexture {
  const { element, ctx } = canvas(128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();
  return new CanvasTexture(element);
}

/** Agent name + sub-line inside a glass pill (SPEC 6). */
export function labelTexture(name: string, sub: string, subColor: string): CanvasTexture {
  const { element, ctx } = canvas(512, 150);
  const fontSize = name.length > 16 ? 36 : 48;

  ctx.font = `600 ${fontSize}px "Segoe UI", Inter, Arial`;
  const nameWidth = ctx.measureText(name).width;
  ctx.font = '31px "Segoe UI", Inter, Arial';
  const subWidth = ctx.measureText(sub).width;
  const pillWidth = Math.min(500, Math.max(nameWidth, subWidth) + 46);

  ctx.fillStyle = 'rgba(8,12,26,.66)';
  ctx.strokeStyle = 'rgba(124,140,255,.32)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect((512 - pillWidth) / 2, 10, pillWidth, 120, 26);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f5ff';
  ctx.font = `600 ${fontSize}px "Segoe UI", Inter, Arial`;
  ctx.fillText(name, 256, 64);
  ctx.fillStyle = subColor;
  ctx.font = '31px "Segoe UI", Inter, Arial';
  ctx.fillText(sub, 256, 112);

  return new CanvasTexture(element);
}

/** Tiny satellite caption (SPEC 5.8 details toggle). */
export function tinyLabelTexture(text: string, color: string): CanvasTexture {
  const { element, ctx } = canvas(512, 80);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = '600 40px "Segoe UI", Inter, Arial';
  ctx.fillText(text.length > 22 ? `${text.slice(0, 21)}…` : text, 256, 52);
  return new CanvasTexture(element);
}

/** The light disc directly beneath the fleet (SPEC 6 grounded scene). */
export function floorTexture(): CanvasTexture {
  const { element, ctx } = canvas(512, 512);
  const gradient = ctx.createRadialGradient(256, 256, 20, 256, 256, 250);
  gradient.addColorStop(0, 'rgba(96,112,230,.30)');
  gradient.addColorStop(0.5, 'rgba(60,70,160,.12)');
  gradient.addColorStop(1, 'rgba(10,14,30,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  return new CanvasTexture(element);
}
