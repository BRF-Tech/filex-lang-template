# filex language pack template

Translate [filex](https://github.com/BRF-Tech/filex) — the self-hosted file
manager — into your language, and ship it as a **language pack** any filex
server installs in one step.

A language pack is a single file, `filex-app.json`. It has no code and no
build: filex reads your translations from it and offers your language in every
picker — the settings dialog, the admin panel, and the public pages a share
link opens. The file explorer, the admin panel and those public pages all
switch to it. Anything you have not translated yet shows in English, so a pack
is useful from the first string.

This repository gives you everything a translator needs:

- the **catalogue** — every string of the filex interface, in English, with
  where it appears and which rules its translation follows;
- a **validator** that checks your translation the way filex will;
- a small **workflow script** that starts your language, shows you what is left,
  and writes `filex-app.json` for you;
- a **CI check**, so a broken string never reaches a server.

All of it runs on Node.js 18 or newer. Nothing to install.

---

## 1. Start

Click **Use this template** on GitHub (or clone the repository), name it
`filex-lang-<your language>`, then:

```bash
node scripts/pack.mjs start es "Spanish"
```

Use your language's tag: `es`, `de`, `pt-br`, `zh-hant`, `ar`… (a region, like
`pt-br` or `es-mx`, also gives that region's date and number formats). This
creates `translations/es.json` with every key of the catalogue and an empty
value, removes the placeholder `xx` sample, and names your pack `lang-es`.

Open `filex-app.json` and adjust the `label`, `description` and `homepage` — the
administrator sees them when installing.

## 2. Translate

Fill in the values of `translations/<tag>.json`. The English is in
`catalogue/filex-catalogue-en.json` (same keys, same order — an editor with a
split view makes this pleasant), and one command shows you what is next, with
context:

```bash
node scripts/pack.mjs next 20
```

```
  ctx.download   (explorer · plain)
    en: "Download"
    tr: "İndir"
    in: packages/core/src/FileExplorer.vue, …
```

An empty value means *not translated yet* — filex shows the English for it.
Translate in any order, commit as often as you like.

### The rules, in one table

filex draws its text with two renderers, and the server writes some of it
itself, so a string's rules depend on where it lives. The catalogue says so for
every key (`in` / `syntax` in `catalogue/filex-catalogue-context.json`, and
`next` prints it):

| | `explorer` (plain) | `admin` (vue-i18n) | `both` | `server` |
|---|---|---|---|---|
| where | the file manager | the admin panel | drawn by both | e-mails, notifications, the public pages |
| placeholders | keep `{name}` exactly | keep `{name}` exactly | keep `{name}` exactly | keep `{name}` exactly — **all of them** |
| plural | a form per category, as its own key: `…_one`, `…_few` … ([Plural forms](#plural-forms)) | the forms in one string, split by a bar, in CLDR order ([Plural forms](#plural-forms)) | — | as the explorer |
| `@` | write it as is | write `{'@'}` | avoid it | write it as is |
| a literal bar | write it as is | write `{'\|'}` | avoid it | write it as is |
| a `%` right before `{` | as is | write `{'%'}{percent}` — `%{percent}` loses the `%` | avoid it | as is |
| `{'…'}` | never — it prints as written | the way to write `@ \| { }` | never | never — it prints as written |

A `server` string is the strict one: it is the only table where **leaving a
placeholder out is an error**, not a warning. The server re-checks each
translation as it sends it, and a line whose placeholders differ from the
English is dropped in favour of the English — better a message in the wrong
language than a share e-mail without its link. An e-mail subject is one line.

In every table, a dash is the plain hyphen `-`: ` - ` between two clauses,
`3-60` for a range, `-1` for a negative number. The validator refuses an em
dash, an en dash and the characters that only pass for a hyphen (U+2010,
U+2011, U+2012, U+2015 and the minus sign U+2212): they read as a machine's
hand, and a search for "read-only" misses the word spelled with U+2011. The one
exception is a label that is the minus sign alone, such as a zoom-out button.

### Plural forms

filex picks a plural form by the **CLDR category** the count falls into in the
reader's language — `Intl.PluralRules` in the browser, the same Unicode rules
on the server: `zero`, `one`, `two`, `few`, `many`, `other`. Your language has
the categories its whole numbers fall into: English and Spanish `one`, `other`;
Russian and Polish `one`, `few`, `many`, `other`; Arabic and Welsh all six;
Japanese and Chinese only `other`. `plural_categories` in
`catalogue/filex-catalogue-context.json` lists them for ~60 languages, and the
validator prints yours.

In the **explorer** and **server** tables each form is its own key. The plain
key is the `other` form and the fallback; there is no `_other`:

```json
"toast.restored_zero": "لم تتم استعادة أي عنصر",
"toast.restored_one":  "تمت استعادة عنصر واحد",
"toast.restored_two":  "تمت استعادة عنصرين",
"toast.restored_few":  "تمت استعادة {n} عناصر",
"toast.restored_many": "تمت استعادة {n} عنصرًا",
"toast.restored":      "تمت استعادة {n} عنصر"
```

In the **admin** table the forms live inside one string, split by a bar, in
CLDR order of **your** categories — six for Arabic, four for Russian — or the
classic 1 form (a language that does not inflect), 2 (`one \| other`) or 3
(`zero \| one \| other`). Any other number of forms is refused.

Two rules worth the ink:

- **Keep the count placeholder in every form.** `{n}`, `{count}` or `{days}` is
  the number as the reader's language formats it; a literal `1` typed into a
  `_one` form is a bug, and filex has fixed exactly that in its own English and
  Turkish. The one exception is a category that holds a single number in your
  language *and* whose natural wording says that number as a **word** — Arabic
  `zero`, `one` and the dual (*يوم واحد*, "one day"). Where a category holds
  several numbers (Russian `one` is also 21, 31, 101…) the count must stay.
- **Write a form only where the words change.** A form you leave out shows your
  plain form — never the English — so `"{n}%"` or `"Page {n} of {m}"` needs no
  second form. A form for a category your language does not have is never read,
  and the validator says `UNUSED`.

Keep `` `code` `` spans, product names and paths as they are. The full guide
is in the filex documentation:
[Writing a language pack](https://docs.filex.sh/PLUGIN-KIT#writing-a-language-pack).

## 3. Validate

```bash
node scripts/pack.mjs build          # writes filex-app.json from translations/
node scripts/validate.mjs filex-app.json
```

```
[es] 97% translated — 3491 of 3588 strings; the other 97 show in English
  plural categories: one, other — explorer/server keys take <key>_one beside
  the plain key (other); admin strings take 2 | forms in that order
  errors: 0 (none) · warnings: 0 (none)
```

The validator checks every string against the catalogue: placeholders, plural
forms, the `@` / bar / `{'…'}` / `%{` rules for the table it belongs to, the
plain hyphen, key shapes and the size limits filex enforces. It exits non-zero on an error.

The limits are **bytes**, not a count of strings — the old 2 000-strings cap is
gone, because filex's catalogue is 6 529 keys. One language: **1 MiB** of keys
plus values (a complete translation runs ~400 KB, more in a two-byte script).
One manifest: **4 MiB** across its languages, and **16 MiB** as a document.
One key: **128 bytes**, of the dotted shape above. One string: **4 KiB**.

Add `--missing` to list what is left, `--complete` to make a missing string an
error, and `--plurals` to list the plural keys that still lack a form for one
of your language's categories.

For the strictest check of admin-panel strings, install vue-i18n's own parser
once — the validator uses it when it is there:

```bash
npm install
```

The included GitHub Actions workflow runs `build --check` and the validator on
every push and pull request.

## 4. Install

Commit `filex-app.json` and push. On any filex server (v0.43.0 or newer), an
administrator opens **Plugins → Apps → Install an app** and chooses:

- **GitHub** — `your-name/filex-lang-es` (and a tag or branch, if you like).
  filex reads `filex-app.json` from the repository root. No release needed.
- **Files** — upload `filex-app.json`. Leave the module empty: a language pack
  has none.

The review says *Language pack* and how much of that server's filex your pack
translates. After installing, pick the language in **Settings → Preferences →
Language** — or, on a public share page, in the language row at the bottom.

A right-to-left language (Arabic, Hebrew, Persian, Urdu…) needs nothing
extra: filex lays the whole interface out right to left in it — the file
manager, the admin panel, the public pages and the e-mails alike.

## 5. Keep it current

When a new filex version adds strings, refresh the catalogue and pick up the
new keys (they are added empty; keys filex no longer has are dropped, by name):

```bash
node scripts/pack.mjs sync --from v0.44.0                  # a filex release
node scripts/pack.mjs sync --from https://files.example.com  # your own server
```

Then translate what is new, bump `version` in `filex-app.json`, and use
**Upgrade** on the pack's row in **Plugins → Apps**.

`sync` also names the keys whose **English changed** since your last sync:

```
[es] 3 key(s) whose English changed - translate them again (the old translation shows until you do): users.subtitle, …
```

Their translation was written for the old words. It stays, and filex keeps
showing it, until you translate the key again - so read each one against the
new English in `catalogue/filex-catalogue-en.json`.

A key filex no longer has leaves `translations/<tag>.json`, translated or not:
every filex release drops a few, and a validator of your own that refuses keys
the catalogue does not have would otherwise fail on each one. Its wording is
still in your git history when the same idea comes back under another name.
The plural forms your language adds to a key filex still has (`<key>_few`)
stay. A retired key written back by hand is kept **out of** `filex-app.json`
by `build`, so it never shows up as a warning on a pack that is otherwise
clean.

## What is in here

```
filex-app.json                     the pack filex installs (written by `build`)
translations/<tag>.json            your translation — the file you edit
catalogue/filex-catalogue-en.json  every string of filex, in English
catalogue/filex-catalogue-context.json   per key: table, rules, plural, Turkish reference, where used
scripts/pack.mjs                   start · next · build · sync
scripts/validate.mjs               the validator (the same one filex's own tests use)
.github/workflows/validate.yml     CI
```

The catalogue here is for **filex v0.55.0**. Every filex release attaches its
own (`filex-catalogue-en.json`), and every running server serves it at
`/admin/i18n/filex-catalogue-en.json`.

## License

[MIT](LICENSE). Translations you write are yours; licensing them under MIT too
lets every filex server use them.
