import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports */
const sfc = require('../../../scripts/sfcScript.js');
const tsAnalyzer = require('../../../scripts/analyze_ts.js');
const jsAnalyzer = require('../../../scripts/analyze_js.js');
/* eslint-enable @typescript-eslint/no-require-imports */

// The review findings on #121: attribute parsing outside quoted values and script
// languages neither analyzer parses. Each case fails when its fix is reverted.

interface Node { id: string; name: string; file: string; line: number; language: string }

/** 1-based line of the first line of `src` containing `needle`. */
function lineOf(src: string, needle: string): number {
  const idx = src.split('\n').findIndex(l => l.includes(needle));
  assert.ok(idx >= 0, `fixture lacks "${needle}"`);
  return idx + 1;
}

function definitions(analyzer: any, files: string[]): Node[] {
  return Object.values(analyzer.collectDefinitions(files)) as Node[];
}

// ---------------------------------------------------------------------------
// Attributes: names are read between attributes, never inside a quoted value
// ---------------------------------------------------------------------------

suite('sfcScript: attribute parsing', () => {
  test('`src` inside a quoted generic constraint is not a src attribute', () => {
    const attrs = sfc.parseAttrs(' setup lang="ts" generic="T extends { src: string }"');
    assert.ok(!attrs.has('src'));
    assert.strictEqual(attrs.get('generic'), 'T extends { src: string }');
    assert.strictEqual(attrs.get('lang'), 'ts');
    assert.strictEqual(attrs.get('setup'), '');
  });

  test('a name needs a boundary: data-src and data-lang are their own names', () => {
    const attrs = sfc.parseAttrs(' data-src="x" data-lang=ts');
    assert.deepStrictEqual([...attrs.keys()], ['data-src', 'data-lang']);
  });

  test('names are case-insensitive; unquoted values may hold `/`; spaces around `=` are allowed', () => {
    const attrs = sfc.parseAttrs(' SRC=./lib/a.js LANG = "TS" ');
    assert.strictEqual(attrs.get('src'), './lib/a.js');
    assert.strictEqual(attrs.get('lang'), 'TS');
  });

  test('single quotes, the first occurrence wins, a stray quoted run is no name, an unclosed quote ends the text', () => {
    assert.strictEqual(sfc.parseAttrs(" lang='tsx' lang=js").get('lang'), 'tsx');
    assert.deepStrictEqual([...sfc.parseAttrs(' "a src b" module').keys()], ['module']);
    assert.strictEqual(sfc.parseAttrs(' lang="ts').get('lang'), 'ts');
    assert.deepStrictEqual([...sfc.parseAttrs(' =x').keys()], [], 'a value without a name is dropped');
  });

  test('a Vue generic block mentioning `src` keeps its function nodes on the right lines', () => {
    const vue = [
      '<template><p /></template>',
      '<script setup lang="ts" generic="T extends { src: string }">',
      'function pick(item: T): string {',
      '  return item.src;',
      '}',
      '</script>',
      '',
    ].join('\n');
    assert.strictEqual(sfc.extractScriptBlocks(vue).length, 1, 'the inline script is not taken for an external one');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cograph-sfc-generic-'));
    try {
      sfc.clearSfcCache();
      const file = path.join(tmp, 'Pick.vue');
      fs.writeFileSync(file, vue);
      const pick = definitions(tsAnalyzer, [file]).find(n => n.name === 'pick');
      assert.ok(pick, 'pick is a node');
      assert.strictEqual(pick.line, lineOf(vue, 'function pick'));
    } finally {
      sfc.clearSfcCache();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Script languages: only JavaScript and TypeScript reach a parser
// ---------------------------------------------------------------------------

suite('sfcScript: unsupported script languages', () => {
  const COFFEE_ONLY = '<script lang="coffee">\nsquare = (x) -> x * x\n</script>\n<template><p /></template>\n';
  const COFFEE_AND_TS = [
    '<script lang="coffee">',
    'cube = (x) -> x * x * x',
    '</script>',
    '<script lang="ts">',
    'export function twice(n: number): number {',
    '  return n * 2;',
    '}',
    '</script>',
    '',
  ].join('\n');
  const COFFEE_AND_JS = '<script lang="coffee">\nfunction fromCoffee() {}\n</script>\n<script>\nfunction fromJs() {}\n</script>\n';
  let tmp: string;

  setup(() => {
    sfc.clearSfcCache();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cograph-sfc-lang-'));
  });
  teardown(() => {
    sfc.clearSfcCache();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('accepted lang values map to the analyzer flavour; anything else is dropped', () => {
    const langOf = (attr: string) => sfc.extractScriptBlocks(`<script ${attr}>\nx\n</script>\n`).map((b: any) => b.lang);
    assert.deepStrictEqual(langOf('lang="typescript"'), ['ts']);
    assert.deepStrictEqual(langOf('lang="TSX"'), ['tsx']);
    assert.deepStrictEqual(langOf('lang="javascript"'), ['js']);
    assert.deepStrictEqual(langOf('lang="jsx"'), ['js']);
    assert.deepStrictEqual(langOf(''), ['js']);
    assert.deepStrictEqual(langOf('lang="coffee"'), []);
    assert.deepStrictEqual(langOf('lang="livescript"'), []);
  });

  test('a component whose only script is CoffeeScript belongs to neither analyzer', () => {
    const file = path.join(tmp, 'Square.vue');
    fs.writeFileSync(file, COFFEE_ONLY);
    assert.strictEqual(sfc.sfcAnalyzerFor(file), null);
    assert.ok(!jsAnalyzer.isJsPath(file), 'not sent to the JavaScript parser');
    assert.ok(!tsAnalyzer.isTsPath(file));
    assert.deepStrictEqual(jsAnalyzer.collectJsFiles(tmp), []);
  });

  test('next to a TS block, the CoffeeScript block is blank in the virtual source and the TS lines hold', () => {
    const blocks = sfc.extractScriptBlocks(COFFEE_AND_TS);
    assert.deepStrictEqual(blocks.map((b: any) => b.lang), ['ts']);
    const virtual: string = sfc.sfcVirtualSource(COFFEE_AND_TS, blocks);
    assert.strictEqual(virtual.length, COFFEE_AND_TS.length);
    assert.ok(!virtual.includes('cube'), 'the coffee code is not parsed');

    const file = path.join(tmp, 'Twice.vue');
    fs.writeFileSync(file, COFFEE_AND_TS);
    const twice = definitions(tsAnalyzer, [file]).find(n => n.name === 'twice');
    assert.ok(twice);
    assert.strictEqual(twice.line, lineOf(COFFEE_AND_TS, 'export function twice'));
  });

  test('next to a plain JS block, only the JS block yields nodes', () => {
    const file = path.join(tmp, 'Mixed.svelte');
    fs.writeFileSync(file, COFFEE_AND_JS);
    assert.deepStrictEqual(definitions(jsAnalyzer, [file]).map(n => n.name), ['fromJs']);
  });
});
