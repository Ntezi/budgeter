// Force a CommonJS build and provide both default + named exports.
const cjs = require('tslib/tslib.js'); // <- CJS entry
module.exports = cjs;
module.exports.default = cjs;          // <- make "default" exist
