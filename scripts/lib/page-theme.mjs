// Who and what a page's photos are for, past its product category (site13 claude-seo audit 2026-11-17, M-13: the
// boardshorts page under Men's Swimwear opened on a woman, the men's and couples pages showed a women's swimsuit on
// the factory table, the children's and modest pages adult bikinis, the watersports and rash guard pages garden
// terraces). A theme is read from the page's category and the menu items above it (its breadcrumb trail), so a page
// whose own name says no audience takes its section's ("Boardshorts" under "Men's Swimwear").
// briefs.pageThemes (config/image-briefs.json) lists the themes in order, the first that matches leading; a product made
// for children (briefs.childCategoryWords) is always the first. A theme may say who wears the product (wearer, the
// model line of the image prompt), which audiences its photos must show (needs: theme ids whose words the alt text
// names), and where the product is used (placeWords: a photo's place names one of them).

import { breadcrumbTrail } from './seo-head.mjs';

export const CHILDREN_THEME = 'children';
// Words, plural "s" dropped, as image-plan.mjs reads category names ("men's" -> "men", "watersports" -> "watersport").
const words = (text) => new Set(String(text ?? '').toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 1).map((word) => word.replace(/s$/, '')));

// The trade's themes, children first: [{ id, words, name, wearer?, needs?, placeWords? }].
export function themeList(briefs) {
  const children = briefs.childCategoryWords?.length ? [{ id: CHILDREN_THEME, words: briefs.childCategoryWords, name: "children's" }] : [];
  return [...children, ...(briefs.pageThemes ?? [])];
}

const matches = (theme, text) => { const found = words(text); return theme.words.some((word) => [...words(word)].every((part) => found.has(part))); };
// Whether a text names a theme (its words), as a page's category does; the text check of a photo before it is made
// reads a brief's audience with it (lib/photo-class.mjs).
export const namesTheme = matches;

// A page's theme: the first theme its category or a menu item above it names, with the place words of every theme
// they name (a women's rash guard is shown where rash guards are worn); null when none.
export function pageTheme({ category, trail = [] }, briefs) {
  const text = [category, ...trail].filter(Boolean).join(' ');
  const named = themeList(briefs).filter((theme) => matches(theme, text));
  if (!named.length) return null;
  const placeWords = [...new Set(named.flatMap((theme) => theme.placeWords ?? []))];
  return { ...named[0], ...(placeWords.length ? { placeWords } : {}) };
}

// Each page's theme id by route, for the pages with one (the menu items above a page from site-nav.json).
export function routeThemes(pages, routes, briefs, nav = null) {
  const themes = {};
  for (const page of pages) {
    const trail = nav ? breadcrumbTrail({ hero: { heading: '' }, ...page }, nav).slice(1, -1).map((crumb) => crumb.name) : [];
    const theme = pageTheme({ category: routes[page.route], trail }, briefs);
    if (theme) themes[page.route] = theme.id;
  }
  return themes;
}

export const themeById = (id, briefs) => (id ? themeList(briefs).find((theme) => theme.id === id) ?? null : null);

// The name a theme gives a product its own name does not place ("boardshorts" for men -> "men's boardshorts").
export const themedName = (name, theme) => (theme?.name && !matches(theme, name) ? `${theme.name} ${name}` : name);

// Whether a made photo shows what its theme asks, read from its alt text. A photo whose alt names a person of an
// audience (a theme with a wearer: a man, a woman) shows the audiences the theme needs and no other (a men's page's
// photo shows a man and no woman; a couples page's both), and is set where the theme's place words say. A photo whose
// alt names nobody (a garment laid flat, a product on its own) passes, as does one with no alt yet (not made: it is
// planned with the theme). person false: a class that shows no model (process, material).
export function fitsTheme(entry, theme, briefs, { person = true } = {}) {
  if (!theme || !entry.alt || !person || entry.productOnly) return true;
  const audiences = themeList(briefs).filter((other) => other.wearer && !other.needs);
  const shown = audiences.filter((other) => matches(other, entry.alt)).map((other) => other.id);
  if (!shown.length) return true;
  // A product for children is shown on no adult (image-plan.mjs forChildren).
  if (theme.id === CHILDREN_THEME) return false;
  const needed = theme.wearer ? theme.needs ?? [theme.id] : shown;
  if (shown.some((id) => !needed.includes(id)) || !needed.every((id) => shown.includes(id))) return false;
  return !theme.placeWords?.length || matches({ words: theme.placeWords }, entry.alt);
}
