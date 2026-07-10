// Metro config so the example can consume the SDK from `file:../..`.
//
// The SDK is symlinked into node_modules and its built files live outside this
// project, so Metro needs to (1) watch the SDK folder and (2) resolve shared deps
// like `react` from THIS app's node_modules even when required from the SDK.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sdkRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sdkRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(sdkRoot, 'node_modules'),
];
// Prefer this app's copy of react / react-native so there's a single instance.
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  'react-native-web': path.resolve(projectRoot, 'node_modules/react-native-web'),
};

module.exports = config;
