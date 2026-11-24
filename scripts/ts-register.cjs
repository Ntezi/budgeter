/* global __dirname */
// Shared TypeScript require hook for `node --test` (no extra dependency):
// transpiles .ts with the repo's TypeScript and resolves the `@/` alias.
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
