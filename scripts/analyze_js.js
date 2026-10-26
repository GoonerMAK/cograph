/**
 * CoGraph JavaScript AST analyzer.
 *
 * Usage: node analyze_js.js <workspace_root>
 *
 * Outputs a JSON call graph to stdout:
 *   { "nodes": [{id, name, file, line, language}], "edges": [{source, target}] }
 *
 * Scope: workspace .js/.jsx/.mjs/.cjs files. Best-effort static analysis.
 * Handles both ESM (import) and CommonJS (require()) imports.
 */

'use strict';

const path = require('path');
const ts   = require('typescript');
const core = require('./tsJsAnalyzer.js');

const JS_EXTENSIONS  = new Set(['.js', '.jsx', '.mjs', '.cjs']);

const options = {
  language: 'javascript',
  scriptName: 'analyze_js.js',
  scriptKind: ts.ScriptKind.JS,
  cjsRequire: true,
  isSourceFile: (file) => JS_EXTENSIONS.has(path.extname(file)),
};

function collectJsFiles(root) {
  return core.collectFiles(root, options);
}

function collectDefinitions(files) {
  return core.collectDefinitions(files, options);
}

function collectCalls(files, definitions, root) {
  return core.collectCalls(files, definitions, root, options);
}

if (require.main === module) {
  core.main(options);
}

if (typeof module !== 'undefined') {
  module.exports = { collectJsFiles, collectDefinitions, collectCalls };
}
