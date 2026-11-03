const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.resolve(workspaceRoot, 'packages/mobile-contracts'),
  path.resolve(workspaceRoot, 'packages/mobile-design'),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.extraNodeModules = {
  '@sornio/mobile-contracts': path.resolve(workspaceRoot, 'packages/mobile-contracts/src'),
  '@sornio/mobile-design': path.resolve(workspaceRoot, 'packages/mobile-design/src'),
};

module.exports = config;
