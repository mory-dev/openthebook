import { mkdirSync, writeFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';

// 1x1 red PNG.
const dotPng = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
));

const files = {
  mimetype: strToU8('application/epub+zip'),
  'META-INF/container.xml': strToU8(
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  ),
  'OEBPS/content.opf': strToU8(
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">test</dc:identifier>' +
    '<dc:title>Test Book</dc:title><dc:language>en</dc:language></metadata>' +
    '<manifest><item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest>' +
    '<spine><itemref idref="c1"/></spine></package>'
  ),
  'OEBPS/chapter1.xhtml': strToU8(
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head>' +
    '<body><h1>Chapter One</h1><p>This is a test paragraph for OpenTheBook. The reader should open directly to ' +
    'this page when launched with the book path.</p><img src="images/dot.png" width="160" height="160" alt="Dot" />' +
    '</body></html>'
  ),
  'OEBPS/images/dot.png': dotPng,
};

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/test-book.epub', zipSync(files, { level: 0 }));
console.log('wrote tmp/test-book.epub');
