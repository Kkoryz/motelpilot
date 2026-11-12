import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { syncTemplateCore } from '../lib/template-core.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('a core sync brings the shared deploy files and the release workflow, and keeps the site\'s own Nginx config', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'core-sync-'));
  await mkdir(join(workspace, 'deploy/nginx'), { recursive: true });
  await writeFile(join(workspace, 'deploy/nginx/site.conf'), 'server {}');
  await syncTemplateCore({ repoRoot, workspaceRoot: workspace, install: () => {} });
  assert.equal(await readFile(join(workspace, 'deploy/nginx/site.conf'), 'utf8'), 'server {}', 'the workspace keeps its Nginx config');
  assert.ok(await stat(join(workspace, 'deploy/server/site-release.sh')));
  assert.ok(await stat(join(workspace, 'deploy/registry/schema.sql')));
  assert.equal(await readFile(join(workspace, '.github/workflows/release.yml'), 'utf8'), await readFile(join(repoRoot, 'deploy/github/release.yml'), 'utf8'));
});

test("a core sync brings the template's packages and installs them when they changed, not otherwise", async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'core-sync-packages-'));
  await writeFile(join(workspace, 'package.json'), '{"dependencies":{}}');
  const installed = [];
  await syncTemplateCore({ repoRoot, workspaceRoot: workspace, install: (root) => installed.push(root) });
  assert.equal(await readFile(join(workspace, 'package.json'), 'utf8'), await readFile(join(repoRoot, 'package.json'), 'utf8'));
  assert.deepEqual(installed, [workspace], 'a package the core imports was added: installed');
  await syncTemplateCore({ repoRoot, workspaceRoot: workspace, install: (root) => installed.push(root) });
  assert.equal(installed.length, 1, 'the same packages: no install');
});
