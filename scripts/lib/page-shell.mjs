// The page shell (site header and footer) of a reference page, and the content markers of page builders that
// render sections as plain divs. Semantic elements and ARIA roles come first; a page builder is recognised only by
// its documented markers, added here once (never in a caller). Browser-side functions receive PAGE_SHELL as an
// argument because code passed to page.evaluate cannot import modules.

const BUILDER_HEADER = ['[data-elementor-type="header"]', '.elementor-location-header'];
const BUILDER_FOOTER = ['[data-elementor-type="footer"]', '.elementor-location-footer'];

const header = ['header', '[role=banner]', ...BUILDER_HEADER].join(', ');
const footer = ['footer', '[role=contentinfo]', ...BUILDER_FOOTER].join(', ');

export const PAGE_SHELL = Object.freeze({
  header,
  footer,
  shell: `${header}, ${footer}`,
  // Top-level content regions and disclosure widgets beyond the semantic defaults.
  sections: ['main > section', 'main > div', 'article > section', '.elementor-top-section', '[data-element_type="section"]'].join(', '),
  disclosureTitles: ['.elementor-accordion-title', '.elementor-tab-title'].join(', '),
  disclosurePanels: ['.elementor-tab-content', '.elementor-accordion-content'].join(', '),
});
