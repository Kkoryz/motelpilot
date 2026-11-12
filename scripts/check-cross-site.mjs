#!/usr/bin/env node

// Stage 11: compare this site's pages with the owner's other sites (scripts/lib/cross-site.mjs). Writes this build's
// fingerprint (docs/research/content-fingerprint.json; build:release also writes it) and the comparison
// (docs/research/cross-site.json): pages whose main text is a near-duplicate of a page on another site hold release.
// Other sites: --against <fingerprint.json | workspace dir> (repeatable) and every *.json in SITE_FINGERPRINTS_DIR
// (a shared folder where each released site leaves its fingerprint).
// Usage: node scripts/check-cross-site.mjs [--against <path> ...]

import { cliArgs, runMain } from './lib/cli.mjs';
import { checkCrossSite } from './lib/cross-site.mjs';

runMain(import.meta.url, async () => {
  const report = await checkCrossSite({ against: cliArgs({ against: { type: 'string', multiple: true } }).values.against ?? [] });
  console.log(`${report.host}: compared with ${report.comparedWith.length} site(s), ${report.duplicates.length} near-duplicate page(s)`);
  for (const item of report.duplicates) console.log(`- ${item.route} ~ ${item.host}${item.otherRoute} (${item.similarity})`);
  if (report.duplicates.length) process.exitCode = 1;
});
