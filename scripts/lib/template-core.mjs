// The template core: code every workspace shares with this repository. A workspace owns only its data
// (src/data, docs/research, public), its tokens (src/styles/global.css) and its treatments (src/styles/reference.css).
// template-core.json in a workspace records which core it runs and the hash of every core file, so drift or a stale
// copy is detected instead of guessed.

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { writeJson } from './json-io.mjs';

export const CORE_PATHS = Object.freeze([
  // The packages the core code imports: a sync that brings new ones installs them (syncTemplateCore).
  'package.json',
  'pnpm-lock.yaml',
  'astro.config.mjs',
  'scripts',
  'config',
  // Operations every site shares: the registry schema, the release workflow and the server release script
  // (deploy/nginx is the workspace's own, written by build:nginx-config).
  'deploy/registry',
  'deploy/github',
  'deploy/server',
  'src/components',
  'src/lib',
  'src/layouts',
  'src/pages',
  'src/styles/template.css',
  'src/styles/patterns.css',
  // The workflow the workspace follows (its tests check it).
  '.claude/skills/seo-site-template/SKILL.md',
  // The hooks a site's treatment may style (the agent steps read it).
  'docs/research/CSS_HOOKS.md',
]);
export const CORE_MANIFEST = 'template-core.json';
export const CORE_SCHEMA = 'seo-site-template-core-v1';

async function listFiles(root, path) {
  const full = resolve(root, path);
  const info = await stat(full).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [path];
  const files = [];
  for (const entry of await readdir(full, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    files.push(...(entry.isDirectory() ? await listFiles(root, child) : [child]));
  }
  return files;
}

async function hashFile(path) {
  // Line endings are normalised so a checkout's CRLF conversion is not reported as drift.
  const text = (await readFile(path)).toString('utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(text).digest('hex');
}

export async function coreHashes(root) {
  const hashes = {};
  for (const path of CORE_PATHS) for (const file of await listFiles(root, path)) hashes[file] = await hashFile(resolve(root, file));
  return hashes;
}

function coreVersion(repoRoot) {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', ...CORE_PATHS], { cwd: repoRoot, encoding: 'utf8' }).trim().length > 0;
    return { commit, dirty };
  } catch {
    return { commit: null, dirty: null };
  }
}

// The workspace's packages installed from its lockfile (the local store first). Not pnpm's optimistic repeat install:
// a copy keeps the source's modification time on Windows, older than the workspace's last install, so pnpm took the
// changed package.json for the installed one ("Already up to date") and ajv stayed missing.
function installPackages(workspaceRoot) {
  const result = spawnSync('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--config.optimistic-repeat-install=false'], { cwd: workspaceRoot, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`pnpm install failed in ${workspaceRoot} (exit ${result.status})`);
}

// Copies the core from the repository into a workspace (replacing stale core files) and records the manifest; when the
// packages changed with it, they are installed (a core that imports a new package would not run otherwise: ajv).
export async function syncTemplateCore({ repoRoot, workspaceRoot, install = installPackages }) {
  const packages = async () => Promise.all(['package.json', 'pnpm-lock.yaml'].map((file) => hashFile(resolve(workspaceRoot, file)).catch(() => null)));
  const before = await packages();
  for (const path of CORE_PATHS) {
    const source = resolve(repoRoot, path);
    if (!(await stat(source).catch(() => null))) continue;
    const target = resolve(workspaceRoot, path);
    if ((await stat(source)).isDirectory()) await rm(target, { recursive: true, force: true });
    await cp(source, target, { recursive: true });
  }
  // The site repository runs the shared workflows: release, and scheduled blog publishing.
  for (const name of ['release.yml', 'blog-publish.yml']) {
    const workflow = resolve(repoRoot, 'deploy/github', name);
    if (!(await stat(workflow).catch(() => null))) continue;
    await mkdir(resolve(workspaceRoot, '.github/workflows'), { recursive: true });
    await cp(workflow, resolve(workspaceRoot, '.github/workflows', name));
  }
  if (JSON.stringify(await packages()) !== JSON.stringify(before)) install(workspaceRoot);
  return writeCoreManifest({ repoRoot, workspaceRoot });
}

export async function writeCoreManifest({ repoRoot, workspaceRoot }) {
  const manifest = { schemaVersion: CORE_SCHEMA, source: relative(workspaceRoot, repoRoot).replaceAll('\\', '/'), ...coreVersion(repoRoot), files: await coreHashes(workspaceRoot) };
  await writeJson(resolve(workspaceRoot, CORE_MANIFEST), manifest);
  return manifest;
}

// Core files a workspace changed or lost since its last sync, and files added to the core without a sync.
export async function coreDrift(workspaceRoot, manifest) {
  const current = await coreHashes(workspaceRoot);
  const drift = [];
  for (const [file, hash] of Object.entries(manifest.files || {})) {
    if (!(file in current)) drift.push({ file, issue: 'missing' });
    else if (current[file] !== hash) drift.push({ file, issue: 'changed' });
  }
  for (const file of Object.keys(current)) if (!(file in (manifest.files || {}))) drift.push({ file, issue: 'unrecorded' });
  return drift;
}
