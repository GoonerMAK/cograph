/**
 * CoGraph TypeScript AST analyzer.
 *
 * Usage: node analyze_ts.js <workspace_root>
 *
 * Outputs a JSON call graph to stdout:
 *   { "nodes": [{id, name, file, line, language}], "edges": [{source, target}] }
 *
 * Scope: workspace .ts/.tsx files (excludes .d.ts). Best-effort static analysis.
 */

'use strict';

const core = require('./tsJsAnalyzer.js');

const options = {
  language: 'typescript',
  scriptName: 'analyze_ts.js',
  scriptKind: undefined,
  cjsRequire: false,
  isSourceFile: (file) => !file.endsWith('.d.ts') && (file.endsWith('.ts') || file.endsWith('.tsx')),
};

function collectTsFiles(root) {
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
  module.exports = { collectTsFiles, collectDefinitions, collectCalls };
}
