#!/usr/bin/env node
/**
 * pack.mjs — the translator's workflow for a filex language pack.
 *
 *   node scripts/pack.mjs start <tag> "<Language name in English>"
 *   node scripts/pack.mjs next [count]          the next untranslated strings
 *   node scripts/pack.mjs build [--check]       translations/*.json → filex-app.json
 *   node scripts/pack.mjs sync [--from <src>]   refresh catalogue/, add new keys
 *
 * A language pack is ONE file filex reads — filex-app.json, with every
 * language under `ui_locales`. You edit translations/<tag>.json (easier to
 * work in, one language per file) and `build` writes the manifest from it.
 * `build --check` fails when filex-app.json is out of date, which is what the
 * CI workflow runs.
 *
 * Node 18+ and nothing else. See README.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAT = path.join(ROOT, 'catalogue');
const TRANS = path.join(ROOT, 'translations');
const MANIFEST = path.join(ROOT, 'filex-app.json');
const TAG = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/;

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJSON = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const die = (msg) => {
  console.error(`pack: ${msg}`);
  process.exit(1);
};

function catalogue() {
  return {
    strings: readJSON(path.join(CAT, 'filex-catalogue-en.json')),
    context: readJSON(path.join(CAT, 'filex-catalogue-context.json')),
  };
}

function languages() {
  return fs
    .readdirSync(TRANS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

/** `x_few` -> { base: 'x', cat: 'few' } for the five plural form suffixes. */
function formOf(key) {
  const m = String(key).match(/^(.+)_(zero|one|two|few|many)$/);
  return m ? { base: m[1], cat: m[2] } : null;
}

/**
 * Does filex still have this key? A catalogue key, or a plural FORM of one:
 * a language whose categories the English does not have writes `<key>_two`,
 * `<key>_few`, `<key>_many` ... and those are not in the catalogue by name.
 */
function known(strings, key) {
  if (key in strings) return true;
  const f = formOf(key);
  return !!f && f.base in strings;
}

/** The manifest as translations/ says it should be. */
function manifestFromTranslations() {
  const m = readJSON(MANIFEST);
  const { strings } = catalogue();
  const ui = {};
  const stale = [];
  for (const tag of languages()) {
    const t = readJSON(path.join(TRANS, `${tag}.json`));
    const done = {};
    for (const [k, v] of Object.entries(t)) {
      // An empty value is "not translated yet": filex would show the English
      // for it anyway, so it stays out of the manifest and out of the coverage.
      if (typeof v !== 'string' || !v.trim()) continue;
      // A key filex NO LONGER HAS stays out too. `sync` deliberately keeps it
      // in translations/<tag>.json -- wording worth recycling when the key
      // comes back under another name -- but shipping it made the validator
      // warn UNKNOWN about every one of them on a pack that was otherwise
      // clean, and the server ignores them.
      if (!known(strings, k)) {
        stale.push(`${tag}:${k}`);
        continue;
      }
      done[k] = v;
    }
    if (Object.keys(done).length) ui[tag] = done;
  }
  if (stale.length) {
    const shown = stale.slice(0, 6).join(', ');
    console.log(`${stale.length} key(s) filex no longer has stayed out of the manifest (still in translations/): ${shown}${stale.length > 6 ? ' \u2026' : ''}`);
  }
  m.ui_locales = ui;
  return m;
}

const [cmd = 'help', ...args] = process.argv.slice(2);

if (cmd === 'start') {
  const [tag, name] = args;
  if (!tag || !TAG.test(tag)) die('usage: start <tag> "<Language name in English>" — tag like es, pt-br, zh-hant');
  if (!name) die('give the language name in English too, e.g. start es "Spanish"');
  const { strings } = catalogue();
  const file = path.join(TRANS, `${tag}.json`);
  if (fs.existsSync(file)) die(`${path.relative(ROOT, file)} already exists`);
  // Every key, in catalogue order, EMPTY — the English is in
  // catalogue/filex-catalogue-en.json, and `next` shows it beside each key.
  writeJSON(file, Object.fromEntries(Object.keys(strings).map((k) => [k, ''])));
  for (const other of languages()) if (other === 'xx') fs.rmSync(path.join(TRANS, 'xx.json'));
  const m = readJSON(MANIFEST);
  m.name = `lang-${tag}`;
  m.label = { en: `${name} language pack` };
  m.description = { en: `The filex interface in ${name}.` };
  writeJSON(MANIFEST, m);
  writeJSON(MANIFEST, manifestFromTranslations());
  console.log(`translations/${tag}.json — ${Object.keys(strings).length} strings to translate.`);
  console.log('Next: node scripts/pack.mjs next 20');
} else if (cmd === 'next') {
  const n = Number(args[0]) || 20;
  const { strings, context } = catalogue();
  for (const tag of languages()) {
    const t = readJSON(path.join(TRANS, `${tag}.json`));
    const todo = Object.keys(strings).filter((k) => !(typeof t[k] === 'string' && t[k].trim()));
    console.log(`[${tag}] ${Object.keys(strings).length - todo.length} of ${Object.keys(strings).length} translated, ${todo.length} to go`);
    for (const k of todo.slice(0, n)) {
      const c = context.keys?.[k] ?? {};
      console.log(`\n  ${k}   (${c.in ?? '?'} · ${c.syntax ?? '?'})`);
      console.log(`    en: ${JSON.stringify(strings[k])}`);
      if (c.tr) console.log(`    tr: ${JSON.stringify(c.tr)}`);
      if (c.where?.length) console.log(`    in: ${c.where.slice(0, 3).join(', ')}`);
    }
  }
} else if (cmd === 'build') {
  const want = `${JSON.stringify(manifestFromTranslations(), null, 2)}\n`;
  const have = fs.readFileSync(MANIFEST, 'utf8').replace(/\r\n/g, '\n');
  if (args.includes('--check')) {
    if (want !== have) die('filex-app.json is out of date — run `node scripts/pack.mjs build` and commit it');
    console.log('filex-app.json is up to date.');
  } else {
    fs.writeFileSync(MANIFEST, want);
    console.log('filex-app.json written.');
  }
} else if (cmd === 'sync') {
  // Refresh the catalogue from a filex release, a running filex, or a folder,
  // then give every translation the keys it lacks (empty) and name the ones
  // filex no longer has.
  const from = args[args.indexOf('--from') + 1];
  if (args.includes('--from') && from) {
    const names = ['filex-catalogue-en.json', 'filex-catalogue-context.json'];
    for (const name of names) {
      let body;
      if (/^v?\d+\.\d+\.\d+$/.test(from)) {
        const tag = from.startsWith('v') ? from : `v${from}`;
        body = await (await fetch(`https://github.com/BRF-Tech/filex/releases/download/${tag}/${name}`)).text();
      } else if (/^https?:\/\//.test(from)) {
        body = await (await fetch(`${from.replace(/\/+$/, '')}/admin/i18n/${name}`)).text();
      } else {
        body = fs.readFileSync(path.join(from, name), 'utf8');
      }
      JSON.parse(body);
      fs.writeFileSync(path.join(CAT, name), body);
    }
    console.log(`catalogue/ refreshed from ${from}`);
  }
  const { strings } = catalogue();
  for (const tag of languages()) {
    const file = path.join(TRANS, `${tag}.json`);
    const t = readJSON(file);
    const next = {};
    for (const k of Object.keys(strings)) next[k] = typeof t[k] === 'string' ? t[k] : '';
    const gone = Object.keys(t).filter((k) => !(k in strings));
    for (const k of gone) next[k] = t[k];
    writeJSON(file, next);
    const added = Object.keys(strings).filter((k) => !(k in t)).length;
    console.log(`[${tag}] ${added} new key(s) added (empty); ${gone.length} key(s) filex no longer has${gone.length ? `: ${gone.slice(0, 10).join(', ')}` : ''}`);
  }
  writeJSON(MANIFEST, manifestFromTranslations());
} else {
  console.log('usage: node scripts/pack.mjs start <tag> "<Name>" | next [n] | build [--check] | sync [--from vX.Y.Z | https://your-filex | ./dir]');
}
