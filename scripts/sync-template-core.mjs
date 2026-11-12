#!/usr/bin/env node

// Updates one or more workspaces to this repository's template core and records template-core.json.
// Usage: node scripts/sync-template-core.mjs <workspace> [<workspace> ...]

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMain, usage } from './lib/cli.mjs';
import { syncTemplateCore } from './lib/template-core.mjs';

runMain(import.meta.url, async () => {
  const workspaces = process.argv.slice(2).filter((arg) => arg !== '--');
  if (!workspaces.length || workspaces.some((arg) => arg.startsWith('-'))) return usage('Usage: node scripts/sync-template-core.mjs <workspace> [<workspace> ...]');
  const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  // Only an existing template workspace (it has site-template.json): a mistyped path must not become a new folder.
  const missing = workspaces.filter((workspace) => !existsSync(resolve(workspace, 'site-template.json')));
  if (missing.length) throw new Error(`not a template workspace (no site-template.json): ${missing.join(', ')}`);
  for (const workspace of workspaces) {
    const manifest = await syncTemplateCore({ repoRoot, workspaceRoot: resolve(workspace) });
    console.log(`${workspace}: core ${manifest.commit?.slice(0, 7) ?? 'unknown'}${manifest.dirty ? ' (uncommitted changes)' : ''}, ${Object.keys(manifest.files).length} files`);
  }
}, { stack: true });
