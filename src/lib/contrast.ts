/** Utilidades de contraste WCAG 2.x para tokens `oklch(L C h [/ a])` de `index.css`. */

export type Rgb = [number, number, number]; // 0–1, sRGB gamma-codificado

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** OKLCH → sRGB (Björn Ottosson). Recorta lo que cae fuera del gamut. */
export function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin: Rgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const encode = (v: number) => {
    const x = clamp(v);
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  };
  return [encode(lin[0]), encode(lin[1]), encode(lin[2])];
}

export type Color = { rgb: Rgb; alpha: number };

export function parseOklch(value: string): Color {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/.exec(
    value.trim(),
  );
  if (!match) throw new Error(`Color no soportado: ${value}`);
  const [, l, c, h, alpha, percent] = match;
  const a = alpha === undefined ? 1 : percent ? Number(alpha) / 100 : Number(alpha);
  return { rgb: oklchToRgb(Number(l), Number(c), Number(h)), alpha: a };
}

/** Pinta `top` (con su alfa) sobre un fondo opaco. */
export function over(top: Color, bottom: Color): Color {
  const rgb = top.rgb.map((v, i) => v * top.alpha + bottom.rgb[i] * (1 - top.alpha)) as Rgb;
  return { rgb, alpha: 1 };
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Color, b: Color): number {
  const [hi, lo] = [luminance(a.rgb), luminance(b.rgb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
