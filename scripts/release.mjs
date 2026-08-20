#!/usr/bin/env node
/**
 * Cuts a kit release: verify, bump every version to the same number, commit, tag.
 *
 * Why the tagged tree keeps `workspace:*` rather than rewriting it into git
 * specs, which is the obvious-looking thing to do and is wrong here:
 *
 * pnpm prepares a git dependency by fetching the WHOLE repo, running
 * `pnpm install` at its root (all workspace projects), then extracting the
 * subdirectory named by `path:`. So `workspace:*` is exactly what that install
 * needs, and a git spec instead makes it try to re-fetch this same repo from
 * GitHub over ssh, which fails on any machine that authenticates over https
 * (all of ours) and in every CI and Docker build.
 *
 * What a consumer must not see is `workspace:*` in a package's `dependencies`,
 * because pnpm then looks for a workspace member that is not there. Hence the
 * one structural rule this repo lives by: intra-kit deps go in
 * `devDependencies` (for the prepare install) plus a versioned
 * `peerDependencies` entry (for the consumer), never in `dependencies`.
 * `pnpm test` in a scratch consumer is how that was established; see CLAUDE.md.
 *
 * Usage: pnpm release 0.2.0
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REMOTE = 'github:engineering-alpina/alpina-kit';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: pnpm release <major.minor.patch>');
  process.exit(1);
}
const tag = `v${version}`;

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

if (git('status', '--porcelain')) {
  console.error('working tree is dirty; commit or stash first');
  process.exit(1);
}
if (git('tag', '--list', tag)) {
  console.error(`${tag} already exists. Tags are never moved; cut a new patch instead.`);
  process.exit(1);
}

const packagesDir = join(ROOT, 'packages');
const dirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const names = new Set();
for (const dir of dirs) {
  const manifest = JSON.parse(readFileSync(join(packagesDir, dir, 'package.json'), 'utf8'));
  names.add(manifest.name);
}

/** Guards the rule the whole distribution model rests on. */
function assertNoWorkspaceRuntimeDeps() {
  const broken = [];
  for (const dir of dirs) {
    const manifest = JSON.parse(readFileSync(join(packagesDir, dir, 'package.json'), 'utf8'));
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      if (names.has(name)) broken.push(`${manifest.name} -> ${name}`);
    }
  }
  if (broken.length) {
    console.error(
      'intra-kit packages must not appear in "dependencies" (a consumer cannot resolve\n' +
        'workspace:* and a git spec breaks prepare). Move them to devDependencies +\n' +
        `peerDependencies:\n  ${broken.join('\n  ')}`,
    );
    process.exit(1);
  }
}

assertNoWorkspaceRuntimeDeps();

console.log(`> verifying before tagging ${tag}`);
execFileSync('pnpm', ['-r', 'typecheck'], { cwd: ROOT, stdio: 'inherit' });
execFileSync('pnpm', ['-r', 'test'], { cwd: ROOT, stdio: 'inherit' });
execFileSync('pnpm', ['-r', 'build'], { cwd: ROOT, stdio: 'inherit' });

for (const file of [
  join(ROOT, 'package.json'),
  ...dirs.map((d) => join(packagesDir, d, 'package.json')),
]) {
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.version = version;
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

git('add', '-A');
// The first release, or a re-tag of an already-bumped tree, changes no version
// and leaves nothing staged. `git commit` exits non-zero on an empty commit, so
// only commit when the bump actually moved something; the tag still gets cut.
if (git('status', '--porcelain')) {
  git('commit', '-m', `chore(release): ${tag}`);
} else {
  console.log(`versions already at ${version}; tagging without a bump commit`);
}
git('tag', '-a', tag, '-m', `alpina-kit ${tag}`);

console.log(`\ntagged ${tag}. Push with:\n  git push origin main ${tag}`);
console.log('Consumers pin every kit package they use at this tag, for example:');
console.log(`  "@alpina/service-kit": "${REMOTE}#${tag}&path:/packages/service-kit"`);
