import Color from 'colorjs.io';
import { readFileSync, writeFileSync } from 'node:fs';

// Hex tokens remain the compatible source; generated OKLCH values preserve sRGB appearance.
const files = ['light', 'dark'];
for (const theme of files) {
  const tokens = JSON.parse(readFileSync(`tokens/${theme}.json`, 'utf8')).color;
  const color = (name) => new Color(tokens[name].$value);
  const pairs = [
    ['text', 'bg', 4.5], ['muted', 'bg', 4.5], ['muted', 'sidebar', 4.5],
    ['muted', 'soft', 4.5], ['accent', 'bg', 4.5], ['status', 'bg', 4.5],
    ['focus', 'bg', 3], ['focus', 'surface', 3],
  ];
  if (theme === 'light') pairs.push(['on-primary', 'primary', 4.5]);
  for (const [foreground, background, threshold] of pairs) {
    const contrast = Math.abs(color(foreground).contrast(color(background), 'WCAG21'));
    if (contrast < threshold) throw new Error(`${theme}: ${foreground} / ${background} = ${contrast.toFixed(2)}, requires ${threshold}`);
    console.log(`${theme}: ${foreground} / ${background}: ${contrast.toFixed(2)}`);
  }
  const selector = theme === 'light' ? ':root' : ':root[data-theme="dark"]';
  const declarations = Object.entries(tokens).filter(([name, token]) => name !== 'bg' && !name.startsWith('scrollbar-') && /^#[0-9a-f]{6}$/i.test(token.$value)).map(([name, token]) => {
    const value = new Color(token.$value).to('oklch').toString({ precision: 8 });
    return `    --color-${name}: ${value};`;
  });
  writeFileSync(`src/generated/oklch-${theme}.css`, `/* Generated from tokens/${theme}.json; sRGB fallbacks are in tokens-${theme}.css. */\n@supports (color: oklch(50% 0 0)) {\n  ${selector} {\n${declarations.join('\n')}\n  }\n}\n`);
}
