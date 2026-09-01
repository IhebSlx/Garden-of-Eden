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

/**
 * Soft additive halo around a node.
 *
 * Cached per colour: a 120-agent fleet would otherwise allocate 120 identical
 * 128x128 canvases, which is the single biggest cost in the scene.
 */
const glowCache = new Map<number, CanvasTexture>();

export function glowTexture(hex: number): CanvasTexture {
  const cached = glowCache.get(hex);
  if (cached) return cached;
  const texture = buildGlowTexture(hex);
  glowCache.set(hex, texture);
  return texture;
}

function buildGlowTexture(hex: number): CanvasTexture {
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

/** The selection ring and the click burst (SPEC 5.9). One texture for the scene. */
let ringCache: CanvasTexture | undefined;

export function ringTexture(): CanvasTexture {
  ringCache ??= buildRingTexture();
  return ringCache;
}

function buildRingTexture(): CanvasTexture {
  const { element, ctx } = canvas(128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();
  return new CanvasTexture(element);
}

/**
 * Agent name + sub-line inside a glass pill (SPEC 6).
 *
 * Drawn at half the prototype's canvas size: the sprite is only ~150 CSS px wide
 * on screen, so 512x150 was 2x oversampled, and a 120-agent fleet was uploading
 * about 40 MB of label texture in the frame the scene first appeared.
 * Cached by content, so switching views twice does not redraw them.
 */
const LABEL_W = 256;
const LABEL_H = 75;
const labelCache = new Map<string, CanvasTexture>();

export function labelTexture(name: string, sub: string, subColor: string): CanvasTexture {
  const key = `${name}|${sub}|${subColor}`;
  const cached = labelCache.get(key);
  if (cached) return cached;
  const texture = buildLabelTexture(name, sub, subColor);
  labelCache.set(key, texture);
  return texture;
}

function buildLabelTexture(name: string, sub: string, subColor: string): CanvasTexture {
  const { element, ctx } = canvas(LABEL_W, LABEL_H);
  const fontSize = name.length > 16 ? 18 : 24;

  ctx.font = `600 ${fontSize}px "Segoe UI", Inter, Arial`;
  const nameWidth = ctx.measureText(name).width;
  ctx.font = '15.5px "Segoe UI", Inter, Arial';
  const subWidth = ctx.measureText(sub).width;
  const pillWidth = Math.min(250, Math.max(nameWidth, subWidth) + 23);

  ctx.fillStyle = 'rgba(8,12,26,.66)';
  ctx.strokeStyle = 'rgba(124,140,255,.32)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect((LABEL_W - pillWidth) / 2, 5, pillWidth, 60, 13);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f5ff';
  ctx.font = `600 ${fontSize}px "Segoe UI", Inter, Arial`;
  ctx.fillText(name, 128, 32);
  ctx.fillStyle = subColor;
  ctx.font = '15.5px "Segoe UI", Inter, Arial';
  ctx.fillText(sub, 128, 56);

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
let floorCache: CanvasTexture | undefined;

export function floorTexture(): CanvasTexture {
  floorCache ??= buildFloorTexture();
  return floorCache;
}

function buildFloorTexture(): CanvasTexture {
  const { element, ctx } = canvas(512, 512);
  const gradient = ctx.createRadialGradient(256, 256, 20, 256, 256, 250);
  gradient.addColorStop(0, 'rgba(96,112,230,.30)');
  gradient.addColorStop(0.5, 'rgba(60,70,160,.12)');
  gradient.addColorStop(1, 'rgba(10,14,30,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  return new CanvasTexture(element);
}
