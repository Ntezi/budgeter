const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Prefer tslib's ESM build to avoid default-export interop shims
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib') {
    return context.resolveRequest(
      context,
      require.resolve('tslib/tslib.es6.js'),
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
