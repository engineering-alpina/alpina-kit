import { readFileSync } from 'node:fs';
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
 */

const TOKENS = join(dirname(dirname(fileURLToPath(import.meta.url))), 'styles', 'tokens.css');
const css = readFileSync(TOKENS, 'utf8');

/** Prose about shadows and media queries must not be able to fail a test. */
function stripComments(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Declarations, with comments stripped so prose about shadows cannot fail a test. */
function declarations(): { property: string; value: string }[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { property: string; value: string }[] = [];
  for (const match of withoutComments.matchAll(/(--[\w-]+|[a-z-]+)\s*:\s*([^;{}]+);/g)) {
    out.push({ property: match[1]!.trim(), value: match[2]!.trim() });
  }
  return out;
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

describe('token file', () => {
  it('is the canon: no radius above 2px', () => {
    const offenders = declarations()
      .filter((d) => /^--radius(-|$)/.test(d.property) || d.property === 'border-radius')
      .filter((d) => lengthsInPx(d.value).some((px) => px > 2));

    expect(offenders).toEqual([]);
  });

  it('declares a radius scale, all of it flat', () => {
    const radii = declarations().filter((d) => /^--radius(-|$)/.test(d.property));
    expect(radii.length).toBeGreaterThanOrEqual(8);
    for (const r of radii) {
      expect(r.value.trim()).toBe('2px');
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
      const value = shadow.value.trim();
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
    const scale = declarations().filter((d) =>
      /^--shadow-(2xs|xs|sm|md|lg|xl|2xl)$/.test(d.property),
    );
    expect(scale.length).toBe(7);
    for (const d of scale) expect(d.value).toBe('0 0 #0000');
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
    expect(css).toMatch(/--font-sans:[\s\S]*?Geist/);
    expect(css).toMatch(/--font-mono:[\s\S]*?Geist Mono/);
  });

  it('defines dark but does not activate it', () => {
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain('color-scheme: light');
    // No media query anywhere: internal services are light-only, and a dark
    // block that switches itself on is the same bug as not having one.
    expect(stripComments(css)).not.toContain('prefers-color-scheme');
  });

  it('holds values only, no component selectors', () => {
    const selectors = [...stripComments(css).matchAll(/^[ \t]*([^@\s{};][^{};]*?)\s*\{/gm)].map(
      (m) => m[1]!.trim(),
    );
    const allowed = new Set([':root', "[data-theme='dark']", '*', 'html', 'body', '::selection']);
    expect(selectors.filter((s) => !allowed.has(s))).toEqual([]);
  });
});
