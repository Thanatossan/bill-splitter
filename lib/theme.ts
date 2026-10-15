import type { CSSProperties } from "react";
import type { ThemeColor } from "./types";

/** Tailwind 600 / 700 / 50 / 300 / 800 for each accent. */
const THEMES: Record<ThemeColor, [string, string, string, string, string]> = {
  emerald: ["#059669", "#047857", "#ecfdf5", "#6ee7b7", "#065f46"],
  teal: ["#0d9488", "#0f766e", "#f0fdfa", "#5eead4", "#115e59"],
  sky: ["#0284c7", "#0369a1", "#f0f9ff", "#7dd3fc", "#075985"],
  indigo: ["#4f46e5", "#4338ca", "#eef2ff", "#a5b4fc", "#3730a3"],
  violet: ["#7c3aed", "#6d28d9", "#f5f3ff", "#c4b5fd", "#5b21b6"],
  pink: ["#db2777", "#be185d", "#fdf2f8", "#f9a8d4", "#9d174d"],
  rose: ["#e11d48", "#be123c", "#fff1f2", "#fda4af", "#9f1239"],
  orange: ["#ea580c", "#c2410c", "#fff7ed", "#fdba74", "#9a3412"],
};

export const swatch = (color: ThemeColor) => THEMES[color][0];

/** CSS variables consumed by the `accent` colors in globals.css. */
export function themeStyle(color: ThemeColor = "emerald"): CSSProperties {
  const [accent, strong, soft, ring, ink] = THEMES[color] ?? THEMES.emerald;
  return {
    "--accent": accent,
    "--accent-strong": strong,
    "--accent-soft": soft,
    "--accent-ring": ring,
    "--accent-ink": ink,
  } as CSSProperties;
}
