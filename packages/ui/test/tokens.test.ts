import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The canon has exactly two rules that a stylesheet can break silently, and both
 * of them are the difference between "a technical document" and "template AI UI":
 * nothing rounder than 2px, and no shadow. A token file is where a violation
 * would enter, because one edit there rounds every card in the fleet.
 *
 * So this reads the shipped CSS as text and fails on the values themselves.
 *
 * It also pins the one distribution bug this file has actually shipped. v0.1.0
 * declared the font families, the radius scale and the shadow scale INSIDE
 * `@theme`, so a consumer with no Tailwind build step got none of them: a
 * browser discards an unknown at-rule whole, and every property inside it stays
 * undefined. alpina-portal measured `--font-sans` as the empty string with the
 * body rendering in Times. `describe('non-Tailwind consumers')` is that
 * regression, and it is why the scales now hang off `--radius` and
 * `--shadow-flat` in `:root` instead of being written into the theme block.
 */

const PACKAGE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const TOKENS = join(PACKAGE_DIR, 'styles', 'tokens.css');
const css = readFileSync(TOKENS, 'utf8');

/** Prose about shadows and media queries must not be able to fail a test. */
function stripComments(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Splits the CSS at `@theme` / `@theme inline` boundaries, braces balanced.
 *
 * `outside` is what a browser with no Tailwind actually applies. `inside` is
 * everything Tailwind alone can see.
 */
function splitOnThemeBlocks(input: string): { inside: string; outside: string } {
  let inside = '';
  let outside = '';
  let cursor = 0;
  for (;;) {
    const at = input.indexOf('@theme', cursor);
    if (at === -1) {
      outside += input.slice(cursor);
      return { inside, outside };
    }
    outside += input.slice(cursor, at);
    const open = input.indexOf('{', at);
    if (open === -1) return { inside, outside };
    let depth = 0;
    let end = open;
    for (; end < input.length; end += 1) {
      if (input[end] === '{') depth += 1;
      else if (input[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    inside += input.slice(open + 1, end);
    cursor = end + 1;
  }
}

const bare = stripComments(css);
const { inside: themeCss, outside: plainCss } = splitOnThemeBlocks(bare);

/** Declarations in a chunk of CSS, comments already stripped. */
function declarations(source: string = bare): { property: string; value: string }[] {
  const out: { property: string; value: string }[] = [];
  for (const match of source.matchAll(/(--[\w-]+|[a-z-]+)\s*:\s*([^;{}]+);/g)) {
    out.push({ property: match[1]!.trim(), value: match[2]!.trim() });
  }
  return out;
}

/** First value a plain-CSS browser sees for a property. */
const plainValues = new Map<string, string>();
for (const d of declarations(plainCss)) {
  if (!plainValues.has(d.property)) plainValues.set(d.property, d.value);
}

/**
 * Expands `var(--x)` against the plain-CSS declarations, the way a browser
 * would. A `var()` carrying a fallback (`var(--font-geist-sans, 'Geist')`) is
 * left alone, because the fallback is the point.
 */
function resolve(value: string, depth = 6): string {
  if (depth === 0) return value;
  const next = value.replace(/var\((--[\w-]+)\)/g, (whole, name: string) => {
    const found = plainValues.get(name);
    return found === undefined ? whole : found;
  });
  return next === value ? value : resolve(next, depth - 1);
}

/** px, rem and unitless lengths in one value, in px. Anything else returns []. */
function lengthsInPx(value: string): number[] {
  const out: number[] = [];
  for (const m of value.matchAll(/(-?\d*\.?\d+)(px|rem|em)?\b/g)) {
    const n = Number(m[1]);
    if (Number.isNaN(n)) continue;
    const unit = m[2];
    if (unit === 'px') out.push(n);
    else if (unit === 'rem' || unit === 'em') out.push(n * 16);
    else if (n === 0) out.push(0);
  }
  return out;
}

const RADIUS_SCALE = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'].map(
  (s) => `--radius-${s}`,
);
const SHADOW_SCALE = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'].map((s) => `--shadow-${s}`);

describe('token file', () => {
  it('is the canon: no radius above 2px', () => {
    const offenders = declarations()
      .filter((d) => /^--radius(-|$)/.test(d.property) || d.property === 'border-radius')
      .filter((d) => lengthsInPx(resolve(d.value)).some((px) => px > 2));

    expect(offenders).toEqual([]);
  });

  it('declares a radius scale, all of it flat', () => {
    const radii = declarations().filter((d) => /^--radius(-|$)/.test(d.property));
    expect(radii.length).toBeGreaterThanOrEqual(8);
    for (const r of radii) {
      expect(resolve(r.value).trim(), `${r.property}: ${r.value}`).toBe('2px');
    }
  });

  it('is the canon: no shadow that draws anything', () => {
    const shadows = declarations().filter(
      (d) =>
        /^--(inset-|drop-)?shadow(-|$)/.test(d.property) ||
        d.property === 'box-shadow' ||
        d.property === 'text-shadow',
    );

    expect(shadows.length).toBeGreaterThan(0);
    for (const shadow of shadows) {
      const value = resolve(shadow.value).trim();
      const isNone = value === 'none';
      // `0 0 #0000` and friends: a shadow whose every length is zero.
      const isZero = lengthsInPx(value).every((px) => px === 0);
      expect(
        isNone || isZero,
        `${shadow.property}: ${value} draws a shadow; the canon says --shadow is none`,
      ).toBe(true);
    }
  });

  it('keeps `--shadow` itself literally none, the name hand-written CSS uses', () => {
    const shadow = declarations().filter((d) => d.property === '--shadow');
    expect(shadow.length).toBeGreaterThan(0);
    for (const d of shadow) expect(d.value).toBe('none');
  });

  it('keeps the Tailwind shadow scale as a zero shadow, not `none`', () => {
    // `none` inside Tailwind's composed box-shadow invalidates the whole
    // declaration and takes focus rings with it. Pinned so nobody "tidies" it.
    for (const name of SHADOW_SCALE) {
      const declared = declarations().filter((d) => d.property === name);
      expect(declared.length, `${name} is not declared`).toBeGreaterThan(0);
      for (const d of declared) expect(resolve(d.value), `${name}: ${d.value}`).toBe('0 0 #0000');
    }
  });

  it('carries the Alpina blue as the one hex in the file', () => {
    expect(css).toContain('--primary: #3c49ec');
    const hexes = new Set(
      declarations()
        .flatMap((d) =>
          [...d.value.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()),
        )
        .filter((hex) => hex !== '#0000'),
    );
    // Light brand blue plus the dark-mode pair, and nothing else.
    expect([...hexes].sort()).toEqual(['#12142e', '#3c49ec', '#8b93ff']);
  });

  it('wires Geist for both families', () => {
    expect(resolve('var(--font-sans)')).toContain('Geist');
    expect(resolve('var(--font-mono)')).toContain('Geist Mono');
    expect(resolve('var(--font-heading)')).toContain('Geist');
  });

  it('defines dark but does not activate it', () => {
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain('color-scheme: light');
    // No media query anywhere: internal services are light-only, and a dark
    // block that switches itself on is the same bug as not having one.
    expect(bare).not.toContain('prefers-color-scheme');
  });

  it('holds values only, no component selectors', () => {
    const selectors = [...bare.matchAll(/^[ \t]*([^@\s{};][^{};]*?)\s*\{/gm)].map((m) =>
      m[1]!.trim(),
    );
    const allowed = new Set([':root', "[data-theme='dark']", '*', 'html', 'body', '::selection']);
    expect(selectors.filter((s) => !allowed.has(s))).toEqual([]);
  });
});

/**
 * The regression alpina-portal found on v0.1.0.
 *
 * A browser that never runs Tailwind does not "ignore the @theme keyword and
 * keep the declarations": it discards the whole at-rule, so every custom
 * property inside is undefined. Anything a consumer's own CSS reads therefore
 * has to be declared in plain `:root`, with `@theme` doing nothing but aliasing.
 */
describe('non-Tailwind consumers', () => {
  it('declares the font families outside any @theme block', () => {
    for (const name of ['--sans', '--mono', '--heading', '--font-sans', '--font-mono']) {
      expect(plainValues.get(name), `${name} is missing from plain CSS`).toBeDefined();
      expect(resolve(`var(${name})`), name).toMatch(/Geist/);
    }
  });

  it('declares the whole radius scale outside any @theme block', () => {
    for (const name of ['--radius', ...RADIUS_SCALE]) {
      expect(plainValues.get(name), `${name} is missing from plain CSS`).toBeDefined();
      expect(resolve(`var(${name})`), name).toBe('2px');
    }
  });

  it('declares the whole shadow scale outside any @theme block', () => {
    for (const name of ['--shadow-flat', ...SHADOW_SCALE]) {
      expect(plainValues.get(name), `${name} is missing from plain CSS`).toBeDefined();
      expect(resolve(`var(${name})`), name).toBe('0 0 #0000');
    }
    expect(resolve('var(--shadow)')).toBe('none');
  });

  it('lets @theme hold aliases only, never a value of its own', () => {
    // The rule that stops the bug reappearing in a namespace nobody listed
    // above: a literal inside @theme exists for Tailwind consumers only. Every
    // entry has to point at a plain-CSS name instead.
    const themeEntries = declarations(themeCss);
    expect(themeEntries.length).toBeGreaterThan(30);

    const literals = themeEntries.filter((d) => !/^var\(--[\w-]+\)$/.test(d.value.trim()));
    expect(literals).toEqual([]);
  });

  it('resolves every @theme alias against a plain-CSS declaration', () => {
    const dangling = declarations(themeCss).filter((d) => {
      const target = /^var\((--[\w-]+)\)$/.exec(d.value.trim())?.[1];
      return target === undefined || !plainValues.has(target);
    });
    expect(dangling).toEqual([]);
  });
});

/**
 * The second thing a consumer could not have guessed: the compiled primitives
 * use base-ui state variants Tailwind does not ship. They came from
 * `shadcn/tailwind.css`, upwork-crm happened to import it, and a consumer that
 * followed the README literally got dialogs and tooltips with no open or closed
 * styling. Tailwind drops an unknown variant without a word, so nothing pointed
 * at the cause.
 */
describe('base-ui variants', () => {
  const defined = new Set([...bare.matchAll(/@custom-variant\s+([\w-]+)/g)].map((m) => m[1]!));

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : [join(dir, entry.name)],
    );
  }

  it('defines every data-* variant the primitives use', () => {
    const used = new Set<string>();
    for (const file of sourceFiles(join(PACKAGE_DIR, 'src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bdata-([a-z]+):/g)) {
        used.add(`data-${m[1]!}`);
      }
    }

    expect(used.size).toBeGreaterThan(0);
    expect([...used].filter((variant) => !defined.has(variant)).sort()).toEqual([]);
  });

  it('keeps the dark variant keyed on the attribute, not a class', () => {
    expect(defined.has('dark')).toBe(true);
    expect(css).toContain("@custom-variant dark (&:is([data-theme='dark'] *));");
  });
});
