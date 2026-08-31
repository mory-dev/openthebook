import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/analyze-epub.mjs <book.epub>');
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(file));
const files = unzipSync(bytes);
const names = Object.keys(files);
console.log('zip entries:', names.length);
console.log('total bytes:', bytes.length);

const containerName = names.find((name) => name.toLowerCase() === 'mime' ? false : name.toLowerCase() === 'meta-inf/container.xml') ?? 'META-INF/container.xml';
const containerBytes = files[containerName] ?? files[names.find((name) => name.toLowerCase().endsWith('container.xml'))];
if (!containerBytes) {
  console.log('NO container.xml found');
  console.log('entries sample:', names.slice(0, 30));
  process.exit(0);
}
const container = strFromU8(containerBytes);
const rootfile = container.match(/full-path="([^"]+)"/)?.[1];
console.log('container.xml rootfile:', rootfile);
if (!rootfile) {
  console.log(container.slice(0, 400));
  process.exit(0);
}

const opfName = names.find((name) => name.toLowerCase() === rootfile.toLowerCase()) ?? rootfile;
const opf = strFromU8(files[opfName]);
const rootDir = opfName.includes('/') ? opfName.slice(0, opfName.lastIndexOf('/')) : '';

const manifest = new Map();
for (const match of opf.matchAll(/<item\b[^>]*>/gi)) {
  const id = match[0].match(/id="([^"]+)"/i)?.[1];
  const href = match[0].match(/href="([^"]+)"/i)?.[1];
  if (id && href) manifest.set(id, `${rootDir}/${href}`.split('/').filter(Boolean).join('/'));
}
const spine = [...opf.matchAll(/<itemref\b[^>]*>/gi)].map((match) => match[0].match(/idref="([^"]+)"/i)?.[1]);
console.log('manifest items:', manifest.size, '| spine items:', spine.length);

const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

spine.slice(0, 6).forEach((idref, index) => {
  const path = manifest.get(idref);
  if (!path) { console.log(`chapter ${index}: missing path for ${idref}`); return; }
  const chapterName = names.find((name) => name.toLowerCase() === path.toLowerCase()) ?? path;
  const raw = chapterName ? strFromU8(files[chapterName]) : '';
  if (!chapterName) { console.log(`chapter ${index} (${path}): FILE MISSING`); return; }
  const imgs = [...raw.matchAll(/<img\b[^>]*>/gi)].length;
  const svgs = [...raw.matchAll(/<svg\b[^>]*>/gi)].length;
  const svgImages = [...raw.matchAll(/<image\b[^>]*>/gi)].length;
  const text = strip(raw);
  console.log(`chapter ${index} ${path}: bytes=${raw.length} img=${imgs} svg=${svgs} svgImage=${svgImages} textChars=${text.length}`);
  console.log('  text head:', JSON.stringify(text.slice(0, 160)));
  const firstImg = raw.match(/<img\b[^>]*>/i)?.[0] ?? raw.match(/<image\b[^>]*>/i)?.[0] ?? '';
  if (firstImg) console.log('  first image tag:', firstImg.slice(0, 300));
});

// Any SVG wrappers across all chapters?
const svgCover = spine.slice(0, 3).map((idref) => {
  const path = manifest.get(idref);
  if (!path) return false;
  const chapterName = names.find((name) => name.toLowerCase() === path.toLowerCase()) ?? path;
  if (!chapterName) return false;
  return /<svg\b/i.test(strFromU8(files[chapterName]));
});
console.log('first 3 chapters have svg:', svgCover);
