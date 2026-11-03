// Builds dist/robosoccer.html: the whole app (code, styles, fonts, logo) in
// one file that runs offline from a USB stick or a laptop with no internet.
//
//   npm run build          write dist/robosoccer.html and the website in site/
//   npm run dev            serve the source folder at http://localhost:8080

import { context, build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const at = (...p) => path.join(root, ...p);

if (process.argv.includes('--serve')) {
  const ctx = await context({});
  const { port } = await ctx.serve({ servedir: root, port: 8080 });
  console.log(`Serving ${root} at http://localhost:${port}`);
} else {
  const base64 = async (file) => (await readFile(file)).toString('base64');
  const logo = `data:image/png;base64,${await base64(at('assets/roboknights-logo.png'))}`;

  const result = await build({
    entryPoints: [at('src/main.js')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2020',
    write: false,
    define: { __LOGO_URL__: JSON.stringify(logo) },
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

  let css = await readFile(at('styles/app.css'), 'utf8');
  const fonts = [...css.matchAll(/url\('\.\.\/assets\/fonts\/([^']+)'\)/g)].map((m) => m[1]);
  for (const font of new Set(fonts)) {
    css = css.replaceAll(`url('../assets/fonts/${font}')`, `url(data:font/woff2;base64,${await base64(at('assets/fonts', font))})`);
  }

  const html = (await readFile(at('index.html'), 'utf8'))
    .replace('<link rel="stylesheet" href="styles/app.css">', () => `<style>${css}</style>`)
    .replace('<script type="module" src="src/main.js"></script>', () => `<script>${js}</script>`);

  await mkdir(at('dist'), { recursive: true });
  await writeFile(at('dist/robosoccer.html'), html);
  console.log(`dist/robosoccer.html  ${(html.length / 1024).toFixed(0)} KB`);

  // The website: the story page at the root, the scorer at scorer/, and the
  // same single file offered as a download. Links are relative so it works on
  // GitHub Pages (under /robosoccer-scorer/) and on Vercel (at /).
  const site = process.env.SITE_URL ?? 'https://ari191210.github.io/robosoccer-scorer/';
  await rm(at('site'), { recursive: true, force: true });
  await mkdir(at('site/scorer'), { recursive: true });
  await mkdir(at('site/img'), { recursive: true });
  await writeFile(at('site/scorer/index.html'), html);
  await writeFile(at('site/robosoccer.html'), html);
  await writeFile(at('site/index.html'), (await readFile(at('web/index.html'), 'utf8')).replaceAll('%SITE_URL%', site));
  await cp(at('web/icon.svg'), at('site/img/icon.svg'));
  await cp(at('docs/screenshots'), at('site/img'), { recursive: true });
  await cp(at('assets/fonts'), at('site/fonts'), { recursive: true });
  console.log(`site/                 story page, scorer/, robosoccer.html`);
}
