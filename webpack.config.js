//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

/**@type {import('webpack').Configuration}*/
const extensionConfig = {
    name: 'extension',
    target: 'node', // vscode extensions run in webworker context for VS Code web 📖 -> https://webpack.js.org/configuration/target/#target

    entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    output: {
        // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: path.resolve(__dirname, 'out'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../[resource-path]',
    },
    devtool: 'source-map',
    externals: {
        vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    },
    resolve: {
        // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
        //mainFields: ['browser', 'module', 'main'], // look for `browser` entry point in imported node modules
        extensions: ['.ts', '.js'],
        //alias: {
        // provides alternate implementation for node module and source files
        //},
        //fallback: {
        // Webpack 5 no longer polyfills Node.js core modules automatically.
        // see https://webpack.js.org/configuration/resolve/#resolvefallback
        // for the list of Node.js core module polyfills.
        //},
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: [/node_modules/, /src\/webview\/wvConfigWebview\.ts$/],
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            compilerOptions: {
                                module: 'es6', // override `tsconfig.json` so that TypeScript emits native JavaScript modules.
                            },
                        },
                    },
                ],
            },
        ],
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: 'src/webview/*.css',
                    to: 'webview/[name][ext]',
                },
            ],
        }),
    ],
};

/**@type {import('webpack').Configuration}*/
const webviewConfig = {
    name: 'webview',
    target: 'web', // webview scripts run in browser context
    entry: './src/webview/wvConfigWebview.ts',
    output: {
        path: path.resolve(__dirname, 'out', 'webview'),
        filename: 'wvConfigWebview.js',
        devtoolModuleFilenameTemplate: '../../[resource-path]',
    },
    devtool: 'source-map',
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: 'src/webview/tsconfig.json',
                        },
                    },
                ],
            },
        ],
    },
};

module.exports = [extensionConfig, webviewConfig];
