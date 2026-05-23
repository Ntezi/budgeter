const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolve(path.join(root, request.slice(2)), parent, isMain, options);
  }
  return originalResolve(request, parent, isMain, options);
};

require.extensions['.ts'] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactNative,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const suites = [
  require('../tests/shopping-import/parser.test.ts').runParserTests,
  require('../tests/shopping-import/matcher.test.ts').runMatcherTests,
  require('../tests/shopping-import/reconcile.test.ts').runReconcileTests,
];

suites.forEach((run) => {
  assert.equal(typeof run, 'function');
  run();
});

console.log(`shopping import tests passed (${suites.length} suites)`);
