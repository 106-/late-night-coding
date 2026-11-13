// Interface language (Japanese / English).
//   t('tuner.save')                 -> string from the current language table
//   t('term.cat.missing', { name }) -> with {name} filled in
// Elements carrying data-i18n / data-i18n-html / data-i18n-title / data-i18n-label are
// re-translated whenever the language changes; setText() marks an element that way from code.
import ja from './lang/ja.js';
import en from './lang/en.js';

const TABLES = { ja, en };
export const LANGS = Object.keys(TABLES);
const STORE_KEY = 'rei-lang';
const listeners = new Set();
let lang = initialLang();

function initialLang() {
  const asked = new URLSearchParams(location.search).get('lang');
  if (TABLES[asked]) return asked;
  try { const saved = localStorage.getItem(STORE_KEY); if (TABLES[saved]) return saved; } catch { /* storage blocked */ }
  return (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

const lookup = (table, key) => key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), table);

const fill = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);

// strings get their {placeholders} filled; arrays (file contents, help lines) come back as they are
export function t(key, vars) {
  const value = lookup(TABLES[lang], key) ?? lookup(TABLES.ja, key);
  if (value === undefined) { console.warn(`i18n: missing ${key}`); return key; }
  return typeof value === 'string' ? fill(value, vars) : value;
}

export const getLang = () => lang;

export function setLang(next) {
  if (!TABLES[next] || next === lang) return;
  lang = next;
  try { localStorage.setItem(STORE_KEY, lang); } catch { /* storage blocked */ }
  translatePage();
  for (const fn of listeners) fn(lang);
}

export const nextLang = () => LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
export const onLangChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

const varsOf = el => (el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : undefined);

export function translatePage(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n, varsOf(el));
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);   // our own strings only
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
}

// set an element's text from a key and keep it translated from then on
export function setText(el, key, vars) {
  el.dataset.i18n = key;
  if (vars) el.dataset.i18nVars = JSON.stringify(vars); else delete el.dataset.i18nVars;
  el.textContent = t(key, vars);
}

// clear text that is not tied to a key
export function clearText(el) {
  delete el.dataset.i18n;
  delete el.dataset.i18nVars;
  el.textContent = '';
}
