import type maplibregl from 'maplibre-gl';

export type RarePinVariant = 'default' | 'inrange' | 'cooldown';

export const RARE_PIN_COLORS = [
  '#10B981',
  '#6366F1',
  '#0EA5E9',
  '#FACC15',
  '#8B5CF6'
] as const;

const PIN_WIDTH = 68;
const PIN_HEIGHT = 84;
const KNOWN_COLOR_SET = new Set<string>(RARE_PIN_COLORS);

/**
 * Returns the MapLibre registered image key for a rare resource pin state.
 */
export function getRarePinIconId(
  color: string,
  inRange: boolean,
  onCooldown: boolean
): string {
  const safeColor = KNOWN_COLOR_SET.has(color) ? color : RARE_PIN_COLORS[0];
  const variant: RarePinVariant = onCooldown
    ? 'cooldown'
    : inRange
      ? 'inrange'
      : 'default';
  return `rare-pin-${safeColor}-${variant}`;
}

function drawPinBitmap(color: string, variant: RarePinVariant): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = PIN_WIDTH;
  canvas.height = PIN_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, PIN_WIDTH, PIN_HEIGHT);
  if (variant === 'cooldown') {
    ctx.globalAlpha = 0.5;
  }

  // Ground contact shadow aligned near anchor='bottom'
  ctx.save();
  ctx.fillStyle = 'rgba(24, 32, 46, 0.36)';
  ctx.beginPath();
  ctx.ellipse(34, 79, 12, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const traceTeardrop = () => {
    ctx.beginPath();
    ctx.moveTo(34, 6);
    ctx.bezierCurveTo(18.4, 6, 6, 18.4, 6, 34);
    ctx.bezierCurveTo(6, 53, 34, 78, 34, 78);
    ctx.bezierCurveTo(34, 78, 62, 53, 62, 34);
    ctx.bezierCurveTo(62, 18.4, 49.6, 6, 34, 6);
    ctx.closePath();
  };

  // In-range gold halo ring behind pin body
  if (variant === 'inrange') {
    ctx.save();
    traceTeardrop();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.restore();
  }

  // Main teardrop fill + chunky Toy-Block outline
  ctx.save();
  traceTeardrop();
  ctx.fillStyle = variant === 'cooldown' ? '#94A3B8' : color;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#18202E';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();

  // Inner emblem circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(34, 32, 11, 0, Math.PI * 2);
  ctx.fillStyle = variant === 'cooldown' ? '#E2E8F0' : '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 3.6;
  ctx.strokeStyle = '#18202E';
  ctx.stroke();
  ctx.restore();

  return ctx.getImageData(0, 0, PIN_WIDTH, PIN_HEIGHT);
}

/**
 * Registers @2x teardrop pin images onto the MapLibre instance, skipping any already present.
 */
export function registerRarePinImages(map: maplibregl.Map): void {
  const variants: RarePinVariant[] = ['default', 'inrange', 'cooldown'];
  for (const color of RARE_PIN_COLORS) {
    for (const variant of variants) {
      const id = `rare-pin-${color}-${variant}`;
      if (map.hasImage(id)) continue;
      const bitmap = drawPinBitmap(color, variant);
      if (!bitmap) continue;
      map.addImage(
        id,
        {
          width: bitmap.width,
          height: bitmap.height,
          data: bitmap.data
        },
        { pixelRatio: 2 }
      );
    }
  }
}
