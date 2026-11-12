// Content checks on the authored pages (Site Factory 07's copy as imported): what a page-by-page read found and no
// build check caught. Each issue names the page, the field and the text, so the list goes back to Site Factory as is;
// the template never rewrites copy.

// Working words of the pipeline that must not reach a reader.
const LEAKED = [
  [/\bfact basis\b/i, 'an internal column name'],
  [/\b(for|on|of) this page\b/i, 'the writer talking about the page'],
  [/\blines? available for this page\b/i, 'the writer talking about the page'],
  [/\[placeholder\]/i, 'placeholder text on an authored page'],
  [/\bknowledge card\b/i, 'a pipeline term'],
  [/\b(section_id|page_id|slot id)\b/i, 'a pipeline term'],
  [/\bTODO\b|\bTBD\b/, 'an unfinished note'],
];
// Research sources a sales page should not cite (the owner's sources rule): study databases.
const ACADEMIC_HOSTS = ['ncbi.nlm.nih.gov', 'pubmed', 'sciencedirect.com', 'researchgate.net', 'springer.com', 'wiley.com', 'mdpi.com'];
const COMMERCIAL = new Set(['home', 'product_manufacturer', 'product_wholesale', 'solution', 'products_hub', 'solutions_hub', 'wholesale_hub']);
// Boilerplate: a block with at least BOILERPLATE_SENTENCES sentences (of MIN_SENTENCE_WORDS words or more) that stand
// word for word on at least REPEATED_ON_PAGES pages (the same terms paragraph with a new first line on every page).
const MIN_SENTENCE_WORDS = 8;
const REPEATED_ON_PAGES = 3;
const BOILERPLATE_SENTENCES = 3;

const plain = (text) => String(text ?? '').replace(/\[([^\]]+)\]\((?:\/[^)]*|https?:\/\/[^)]*)\)/g, '$1');
const normal = (text) => plain(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const sentencesOf = (text) => plain(text).split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);

// Every text field of a page with where it sits: [{ field, text, links: whether the field renders inline links }].
// Blocks the template builds itself (the owner's proof, the plan's cards, the form, the sources list) are the same on
// every page by design and are not Site Factory's copy.
const TEMPLATE_BLOCK = /^(owner-|plan-|media-module-|sources$)/;

export function pageTexts(page) {
  const list = [];
  const add = (field, text, links = false) => { if (typeof text === 'string' && text.trim()) list.push({ field, text, links }); };
  add('seo.title', page.seo?.title); add('seo.description', page.seo?.description); add('hero.heading', page.hero?.heading);
  for (const lead of page.hero?.lead ?? []) add('hero.lead', lead, true);
  for (const block of (page.blocks ?? []).filter((item) => !TEMPLATE_BLOCK.test(item.id) && item.type !== 'form')) {
    const at = (name) => `${block.id}.${name}`;
    add(at('heading'), block.heading);
    for (const paragraph of block.paragraphs ?? []) add(at('paragraph'), paragraph, true);
    for (const item of block.items ?? []) {
      add(at('item.heading'), item.heading); add(at('item.caption'), item.caption); add(at('item.question'), item.question);
      for (const paragraph of item.paragraphs ?? []) add(at('item.paragraph'), paragraph, true);
      for (const line of String(item.answer ?? '').split('\n')) add(at('item.answer'), line, true);
      add(at('item.text'), item.text, true); add(at('item.quote'), item.quote);
    }
    for (const step of block.steps ?? []) { if (typeof step === 'string') add(at('step'), step, true); else { add(at('step.heading'), step.heading); add(at('step.text'), step.text, true); } }
    for (const column of block.columns ?? []) add(at('column'), column);
    for (const row of block.rows ?? []) for (const cell of row) add(at('cell'), cell, true);
  }
  return list;
}

// A sentence that lists many names in a row ("…Bandeau, Micro Bikinis, Ribbed Tie Front Bikini, Skimpy Bikinis…").
export function keywordList(text) {
  for (const sentence of sentencesOf(text)) {
    const items = sentence.split(/,\s*|\s+and\s+/).map((item) => item.trim()).filter(Boolean);
    if (items.length < 6) continue;
    const named = items.filter((item) => /^([A-Z0-9][\w'’&-]*\s?){1,5}$/.test(item.replace(/^(and|or)\s+/i, '')));
    if (named.length >= 5 && named.length / items.length >= 0.6) return sentence.slice(0, 160);
  }
  return null;
}

export function lintContent(pages) {
  const issues = [];
  const sentences = [];
  for (const page of pages.filter((item) => item.status === 'authored')) {
    for (const { field, text, links } of pageTexts(page)) {
      for (const [pattern, why] of LEAKED) if (pattern.test(text)) issues.push({ route: page.route, kind: 'leaked_wording', field, why, text: text.slice(0, 160) });
      if (!links && /\]\((\/|https?:)/.test(text)) issues.push({ route: page.route, kind: 'raw_markdown', field, why: 'link markup in a field that shows text only', text: text.slice(0, 160) });
      const listed = keywordList(text);
      if (listed) issues.push({ route: page.route, kind: 'keyword_list', field, why: 'a run of product names instead of a sentence or a list', text: listed });
      for (const sentence of sentencesOf(text)) if (sentence.split(/\s+/).length >= MIN_SENTENCE_WORDS) sentences.push({ route: page.route, block: field.split('.')[0], key: normal(sentence), sentence });
    }
    if (COMMERCIAL.has(page.pageType)) for (const block of (page.blocks ?? []).filter((item) => item.type === 'sources')) {
      for (const item of block.items ?? []) if (ACADEMIC_HOSTS.some((host) => String(item.url).includes(host))) issues.push({ route: page.route, kind: 'academic_source', field: `${block.id}.item`, why: 'a study database cited on a sales page', text: `${item.title} (${item.url})` });
    }
  }
  // Sentences standing word for word on several pages, then the blocks made mostly of them.
  const pagesOf = new Map();
  for (const item of sentences) pagesOf.set(item.key, new Set([...(pagesOf.get(item.key) ?? []), item.route]));
  const blocks = new Map();
  for (const item of sentences.filter((entry) => pagesOf.get(entry.key).size >= REPEATED_ON_PAGES)) {
    const at = `${item.route} ${item.block}`;
    blocks.set(at, [...(blocks.get(at) ?? []), item]);
  }
  for (const [at, repeated] of blocks) {
    const unique = [...new Map(repeated.map((item) => [item.key, item])).values()];
    if (unique.length < BOILERPLATE_SENTENCES) continue;
    const [route, block] = at.split(' ');
    const pages = Math.min(...unique.map((item) => pagesOf.get(item.key).size));
    issues.push({ route, kind: 'repeated_paragraph', field: block, why: `${unique.length} sentences stand word for word on ${pages} or more pages`, text: unique.map((item) => item.sentence).join(' ').slice(0, 160) });
  }
  return issues;
}

// The list for Site Factory 07, grouped by kind.
export function contentIssuesMarkdown(issues, { site = '' } = {}) {
  const kinds = { leaked_wording: 'Internal wording on the page', raw_markdown: 'Link markup shown as text', keyword_list: 'Keyword lists', repeated_paragraph: 'Boilerplate repeated across pages', academic_source: 'Study databases cited on sales pages' };
  const lines = [`# Content issues${site ? `: ${site}` : ''}`, '', `${issues.length} issue(s) found by scripts/audit-content.mjs. The template never rewrites copy: these go back to Site Factory 07.`, ''];
  for (const [kind, title] of Object.entries(kinds)) {
    const list = issues.filter((issue) => issue.kind === kind);
    if (!list.length) continue;
    lines.push(`## ${title} (${list.length})`, '');
    for (const issue of list) lines.push(`- \`${issue.route}\` ${issue.field}: ${issue.why}. "${issue.text}"`);
    lines.push('');
  }
  return lines.join('\n');
}
