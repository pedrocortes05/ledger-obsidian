import esbuild from 'esbuild';
import { readFileSync } from 'fs';
import process from 'process';
import { builtinModules } from 'node:module';

const prod = process.argv[2] === 'production';

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/*',
    '@lezer/*',
    ...builtinModules,
  ],
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  minify: prod,
  define: {
    // Chartist falls back to Node's `global`, which does not exist in the
    // mobile app's webview.
    global: 'globalThis',
    'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development'),
  },
  outfile: 'main.js',
});

/**
 * Obsidian mobile runs plugins in a webview without Node globals. Fail the
 * build if the bundle still refers to one outside a typeof check.
 */
const checkMobileCompatibility = (file) => {
  const code = readFileSync(file, 'utf8');
  const problems = [];
  for (const name of [
    'global',
    '__dirname',
    '__filename',
    'Buffer',
    'setImmediate',
  ]) {
    const pattern = new RegExp(`(^|[^.\\w$'"\`])${name}(?![\\w$])`, 'g');
    let match;
    while ((match = pattern.exec(code))) {
      const before = code.slice(Math.max(0, match.index - 8), match.index + 1);
      if (!/typeof\s*$/.test(before)) {
        problems.push(
          `${name}: …${code.slice(match.index - 40, match.index + 40)}…`,
        );
      }
    }
  }
  if (problems.length > 0) {
    console.error(
      'Bundle uses Node globals that do not exist on Obsidian mobile:',
    );
    problems.slice(0, 10).forEach((problem) => console.error('  ' + problem));
    process.exit(1);
  }
};

if (prod) {
  await context.rebuild();
  checkMobileCompatibility('main.js');
  process.exit(0);
} else {
  await context.watch();
}
