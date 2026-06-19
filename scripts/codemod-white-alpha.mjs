// One-off codemod: migrate inline rgba(255,255,255,a) backgrounds/borders to
// theme-aware tokens (--surface-* / --line-*) so light mode is no longer
// see-through. Dark values of those tokens equal the original literals, so
// dark mode is unchanged. Keyed on the CSS property to disambiguate.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SURFACE = [
  [0.02, "--surface-002"], [0.03, "--surface-003"], [0.04, "--surface-004"],
  [0.05, "--surface-005"], [0.06, "--surface-006"], [0.08, "--surface-008"],
  [0.10, "--surface-010"],
];
const LINE = [
  [0.04, "--line-004"], [0.06, "--line-006"], [0.07, "--line-007"],
  [0.08, "--line-008"], [0.10, "--line-010"], [0.12, "--line-012"],
  [0.15, "--line-015"],
];

function nearest(table, a) {
  let best = table[0], bd = Infinity;
  for (const row of table) { const d = Math.abs(row[0] - a); if (d < bd) { bd = d; best = row; } }
  return best[1];
}

// Files to leave alone: static image routes (Satori has no CSS vars) and the
// intentionally-dark admin pages.
const EXCLUDE = [/opengraph-image\.tsx$/, /[\\/]share[\\/]/, /[\\/]admin[\\/]/, /icon\.tsx$/, /apple-icon\.tsx$/];

const files = execSync('git ls-files "app/**/*.tsx"', { encoding: "utf8" })
  .split("\n").map(s => s.trim()).filter(Boolean)
  .filter(f => !EXCLUDE.some(re => re.test(f)));

const RGBA = String.raw`rgba\(255,\s*255,\s*255,\s*([0-9.]+)\)`;
const reBg = new RegExp(String.raw`((?:background|backgroundColor)\s*:\s*)(")?` + RGBA + String.raw`(")?`, "g");
const reBorder = new RegExp(String.raw`((?:border|borderTop|borderBottom|borderLeft|borderRight)\s*:\s*)(")?(\d+px\s+(?:solid|dashed)\s+)` + RGBA + String.raw`(")?`, "g");
const reBorderColor = new RegExp(String.raw`(borderColor\s*:\s*)(")?` + RGBA + String.raw`(")?`, "g");

let totalBg = 0, totalBorder = 0, skipped = 0, filesChanged = 0;

for (const file of files) {
  let src = readFileSync(file, "utf8");
  let changed = 0;

  src = src.replace(reBorder, (m, pre, q1, ws, alpha, q2) => {
    const a = parseFloat(alpha);
    if (a > 0.25) { skipped++; return m; }
    const tok = nearest(LINE, Math.min(a, 0.15));
    totalBorder++; changed++;
    return `${pre}${q1 ?? ""}${ws}var(${tok})${q2 ?? ""}`;
  });

  src = src.replace(reBorderColor, (m, pre, q1, alpha, q2) => {
    const a = parseFloat(alpha);
    if (a > 0.25) { skipped++; return m; }
    const tok = nearest(LINE, Math.min(a, 0.15));
    totalBorder++; changed++;
    return `${pre}${q1 ?? ""}var(${tok})${q2 ?? ""}`;
  });

  src = src.replace(reBg, (m, pre, q1, alpha, q2) => {
    const a = parseFloat(alpha);
    if (a > 0.15) { skipped++; return m; } // overlays / scrims — leave
    const tok = nearest(SURFACE, a);
    totalBg++; changed++;
    return `${pre}${q1 ?? ""}var(${tok})${q2 ?? ""}`;
  });

  if (changed) { writeFileSync(file, src); filesChanged++; }
}

console.log(`Files changed: ${filesChanged}`);
console.log(`Backgrounds  -> --surface-*: ${totalBg}`);
console.log(`Borders      -> --line-*:    ${totalBorder}`);
console.log(`Skipped (high-alpha overlays): ${skipped}`);
