const path = require('path');

process.env.TS_NODE_PROJECT = path.resolve(__dirname, 'src/test/tsconfig.json');

module.exports = {
    require: ['ts-node/register', 'tsconfig-paths/register'],
    spec: ['src/test/unit/**/*.test.ts', 'src/test/integration/**/*.test.ts'],
    recursive: true,
    timeout: 10000,
    'watch-files': ['src/**/*.ts'],
};
