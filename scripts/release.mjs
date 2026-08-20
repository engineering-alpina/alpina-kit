#!/usr/bin/env node
/**
 * Cuts a kit release.
 *
 * Consumers pin packages as git deps
 * (`github:engineering-alpina/alpina-kit#v0.2.0&path:/packages/auth`), and a
 * git dep is installed exactly as the tagged tree looks. That breaks on
 * `workspace:*`, which only pnpm inside this repo can resolve. So the tagged
 * commit must carry real git specs, while the branch keeps the workspace
 * protocol or local development stops working.
 *
 * The script therefore makes two commits and tags the first:
 *
 *   1. `chore(release): v<version>` — versions bumped, workspace deps rewritten
 *      to git specs pinned at this tag. This is what consumers install.
 *   2. `chore: back to the workspace protocol` — deps rewritten back.
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
  console.error(`${tag} already exists`);
  process.exit(1);
}

const packagesDir = join(ROOT, 'packages');
const dirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

/** name -> directory, so a workspace dep can be turned into its git path. */
const byName = new Map();
for (const dir of dirs) {
  const manifest = JSON.parse(readFileSync(join(packagesDir, dir, 'package.json'), 'utf8'));
  byName.set(manifest.name, dir);
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

function rewrite(toGitSpec) {
  for (const dir of dirs) {
    const file = join(packagesDir, dir, 'package.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    manifest.version = version;
    for (const field of DEP_FIELDS) {
      const deps = manifest[field];
      if (!deps) continue;
      for (const name of Object.keys(deps)) {
        if (!byName.has(name)) continue;
        deps[name] = toGitSpec
          ? `${REMOTE}#${tag}&path:/packages/${byName.get(name)}`
          : 'workspace:*';
      }
    }
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const root = join(ROOT, 'package.json');
  const rootManifest = JSON.parse(readFileSync(root, 'utf8'));
  rootManifest.version = version;
  writeFileSync(root, `${JSON.stringify(rootManifest, null, 2)}\n`);
}

console.log(`> verifying before tagging ${tag}`);
execFileSync('pnpm', ['-r', 'typecheck'], { cwd: ROOT, stdio: 'inherit' });
execFileSync('pnpm', ['-r', 'test'], { cwd: ROOT, stdio: 'inherit' });
execFileSync('pnpm', ['-r', 'build'], { cwd: ROOT, stdio: 'inherit' });

rewrite(true);
git('add', '-A');
git('commit', '-m', `chore(release): ${tag}`);
git('tag', '-a', tag, '-m', `alpina-kit ${tag}`);

rewrite(false);
git('add', '-A');
git('commit', '-m', 'chore: back to the workspace protocol');

console.log(`\ntagged ${tag}. Push with:\n  git push origin main ${tag}`);
console.log('Consumers pin, for example:');
console.log(`  "@alpina/service-kit": "${REMOTE}#${tag}&path:/packages/service-kit"`);
