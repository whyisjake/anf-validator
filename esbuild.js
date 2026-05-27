const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  external: ['vscode'], // vscode is provided by the Extension Host at runtime — never bundle it
  format: 'cjs',        // VS Code Extension Host requires CommonJS
  platform: 'node',
  outfile: 'dist/extension.js',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

if (watch) {
  esbuild
    .context(buildOptions)
    .then((ctx) => ctx.watch())
    .catch(() => process.exit(1));
} else {
  esbuild.build(buildOptions).catch(() => process.exit(1));
}
