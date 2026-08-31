export type BookFormat = 'pdf' | 'epub' | 'azw3' | 'mobi';

export type ParsedBook = {
  title: string;
  author?: string;
  format: BookFormat;
  chapters: string[];
  chapterPaths?: string[];
  imageFiles?: Map<string, Uint8Array>;
  rawText?: string;
  startChapter?: number;
};

const decoder = new TextDecoder('utf-8');

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function zipPath(base: string, href: string): string {
  const parts = `${base}/${href}`.split('/');
  const clean: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') clean.pop();
    else clean.push(part);
  }
  return clean.join('/');
}

export function extractTextFromHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, ' ');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT);
  let text = '';
  let node: Node | null;
  while ((node = walker.nextNode())) {
    text += node.textContent ?? '';
  }
  return text;
}

export function stripHtml(html: string): string {
  return extractTextFromHtml(html);
}

function sanitizeMarkup(markup: string): string {
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, form').forEach((node) => node.remove());
  doc.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on')) node.removeAttribute(attribute.name);
    }
  });
  return doc.body.innerHTML;
}

export function textChapter(text: string): string {
  if (/<(?:html|body|p|div|h1|h2|h3)\b/i.test(text)) return sanitizeMarkup(text);
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function mimeFor(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'avif': return 'image/avif';
    case 'svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** Replace relative image sources with data URIs and sanitize markup so chapters render safely and quickly. */
export function inlineChapterImages(html: string, chapterPath: string, getFile?: (name: string) => Uint8Array | undefined): string {
  if (!/<(?:html|body|p|div|h1|h2|h3|img|image|svg)\b/i.test(html)) {
    return textChapter(html);
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, form').forEach((node) => node.remove());
  doc.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on')) node.removeAttribute(attribute.name);
    }
  });
  if (getFile) {
    const chapterDir = chapterPath && chapterPath.includes('/') ? chapterPath.slice(0, chapterPath.lastIndexOf('/')) : '';
    doc.querySelectorAll('img, image').forEach((node) => {
      const image = node as Element;
      const src = image.getAttribute('src') ?? image.getAttribute('xlink:href') ?? image.getAttribute('href');
      if (!src || /^(data:|https?:|blob:)/i.test(src)) return;
      const cleanSrc = decodeURIComponent(src.split('?')[0]);
      const resolved = chapterPath ? zipPath(chapterDir, cleanSrc) : cleanSrc;
      const bytes = getFile(resolved) ?? getFile(cleanSrc) ?? getFile(src.toLowerCase());
      if (!bytes || bytes.length > 8 * 1024 * 1024) {
        image.remove();
        return;
      }
      const dataUri = `data:${mimeFor(src)};base64,${bytesToBase64(bytes)}`;
      if (image.tagName.toLowerCase() === 'image') {
        image.setAttribute('href', dataUri);
        image.setAttribute('xlink:href', dataUri);
      } else {
        image.setAttribute('src', dataUri);
      }
    });
    doc.querySelectorAll('svg').forEach((svg) => {
      if (svg.querySelector('image')) {
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }
    });
  }
  return doc.body.innerHTML;
}

export function authorFromFilename(path: string): string | undefined {
  const name = path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? '';
  const parenthesized = name.match(/\(([^()]+)\)\s*$/);
  if (parenthesized) return parenthesized[1].trim();
  const dashSeparated = name.match(/\s+-\s+([^-]+)$/);
  if (dashSeparated) return dashSeparated[1].trim();
  const bySeparated = name.match(/\s+by\s+([^,]+)$/i);
  if (bySeparated) return bySeparated[1].trim();
  return undefined;
}

export async function parseEpub(buffer: ArrayBuffer): Promise<ParsedBook> {
  const { unzipSync } = await import('fflate');
  const files = unzipSync(new Uint8Array(buffer));
  const getFile = (name: string) => files[name] ?? files[Object.keys(files).find((key) => key.toLowerCase() === name.toLowerCase()) ?? ''];
  const containerBytes = getFile('META-INF/container.xml');
  if (!containerBytes) throw new Error('This EPUB has no readable container document.');
  const container = decoder.decode(containerBytes);
  const containerDoc = new DOMParser().parseFromString(container, 'application/xml');
  const rootfile = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!rootfile) throw new Error('This EPUB has no readable package document.');

  const opfBytes = getFile(rootfile);
  if (!opfBytes) throw new Error('This EPUB has no readable package document.');
  const opf = decoder.decode(opfBytes);
  const opfDoc = new DOMParser().parseFromString(opf, 'application/xml');
  const rootDir = rootfile.includes('/') ? rootfile.slice(0, rootfile.lastIndexOf('/')) : '';
  const title = opfDoc.querySelector('title, dc\\:title')?.textContent?.trim() || 'Untitled book';
  const author = opfDoc.querySelector('creator, dc\\:creator')?.textContent?.trim() || undefined;
  const manifest = new Map<string, string>();
  opfDoc.querySelectorAll('manifest item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, zipPath(rootDir, decodeURIComponent(href)));
  });
  const chapterPaths: string[] = [];
  const rawChapters = [...opfDoc.querySelectorAll('spine itemref')]
    .map((item) => manifest.get(item.getAttribute('idref') ?? ''))
    .filter((path): path is string => Boolean(path));
  const chapters: string[] = [];
  for (const path of rawChapters) {
    const bytes = getFile(path);
    if (!bytes) continue;
    chapterPaths.push(path);
    chapters.push(decoder.decode(bytes));
  }
  if (!chapters.length) throw new Error('This EPUB has no readable chapters.');
  const startChapter = Math.max(0, chapters.findIndex((chapter) => stripHtml(chapter).length >= 150));
  const imageFiles = new Map<string, Uint8Array>();
  Object.entries(files).forEach(([name, bytes]) => {
    if (/\.(jpe?g|png|gif|webp|avif|svg)$/i.test(name)) imageFiles.set(name.toLowerCase(), bytes);
  });
  return { title, author, format: 'epub', chapters, chapterPaths, imageFiles, startChapter };
}

function palmDocDecompress(bytes: Uint8Array): Uint8Array {
  const output: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if (b === 0x00) {
      output.push(0x00);
    } else if (b >= 0x01 && b <= 0x08) {
      for (let count = 0; count < b && i + 1 < bytes.length; count += 1) {
        output.push(bytes[++i]);
      }
    } else if (b >= 0x09 && b <= 0x7f) {
      output.push(b);
    } else if (b >= 0x80 && b <= 0xbf && i + 1 < bytes.length) {
      const next = bytes[++i];
      const distance = ((b & 0x3f) << 5) | (next >> 3);
      const length = (next & 0x07) + 3;
      for (let count = 0; count < length; count += 1) {
        output.push(output[output.length - distance] ?? 0x20);
      }
    } else if (b >= 0xc0 && b <= 0xff) {
      output.push(0x20);
      output.push(b ^ 0x80);
    }
  }
  return new Uint8Array(output);
}

function getTrailingLength(chunk: Uint8Array, flags: number): number {
  let num = 0;
  let testflags = flags >> 1;
  while (testflags > 0) {
    if (testflags & 1) {
      let v = 0;
      for (let i = 0; i < 4; i += 1) {
        const idx = chunk.length - num - 1 - i;
        if (idx < 0) break;
        const b = chunk[idx];
        v |= ((b ?? 0) & 0x7f) << (i * 7);
        if (((b ?? 0) & 0x80) !== 0) break;
      }
      num += v;
    }
    testflags >>= 1;
  }
  if ((flags & 1) !== 0) {
    const idx = chunk.length - num - 1;
    if (idx >= 0) {
      num += ((chunk[idx] ?? 0) & 3) + 1;
    }
  }
  return Math.max(0, chunk.length - num);
}

function parsePalmBook(buffer: ArrayBuffer, format: 'mobi' | 'azw3'): ParsedBook {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const label = format === 'azw3' ? 'AZW3' : 'MOBI';
  if (bytes.length < 100) throw new Error(`This ${label} file is too small to read.`);
  const recordCount = readU16(view, 76);
  const offsets = Array.from({ length: recordCount }, (_, index) => readU32(view, 78 + index * 8));
  const firstRecord = offsets[0];
  if (firstRecord === undefined || ascii(bytes.slice(firstRecord + 16, firstRecord + 20)) !== 'MOBI') {
    throw new Error(`This ${label} file has no readable text record.`);
  }
  const mobiOffset = firstRecord + 16;
  const compression = readU16(view, firstRecord);
  if (compression !== 1 && compression !== 2) {
    throw new Error(`This ${label} file uses protected or unsupported compression. DRM-protected books cannot be opened by OpenTheBook.`);
  }
  const textRecordCount = readU16(view, firstRecord + 8);
  const mobiHeaderLength = readU32(view, mobiOffset + 4);
  const exthFlags = readU32(view, mobiOffset + 112);
  const titleOffset = readU32(view, mobiOffset + 68);
  const titleLength = readU32(view, mobiOffset + 72);
  const firstImageRecord = readU32(view, mobiOffset + 92);

  let title = '';
  if (titleOffset > 0 && titleLength > 0 && firstRecord + titleOffset + titleLength <= bytes.length) {
    title = new TextDecoder('utf-8').decode(bytes.slice(firstRecord + titleOffset, firstRecord + titleOffset + titleLength)).trim();
  }

  let author: string | undefined;
  if (exthFlags & 0x40) {
    const exthOffset = mobiOffset + mobiHeaderLength;
    if (exthOffset + 12 <= bytes.length && ascii(bytes.slice(exthOffset, exthOffset + 4)) === 'EXTH') {
      const exthCount = readU32(view, exthOffset + 8);
      let ptr = exthOffset + 12;
      for (let i = 0; i < exthCount && ptr + 8 <= bytes.length; i += 1) {
        const tag = readU32(view, ptr);
        const tagLen = readU32(view, ptr + 4);
        if (tagLen < 8 || ptr + tagLen > bytes.length) break;
        const tagData = bytes.slice(ptr + 8, ptr + tagLen);
        if (tag === 100 && !author) {
          author = new TextDecoder('utf-8').decode(tagData).trim();
        } else if (tag === 503) {
          title = new TextDecoder('utf-8').decode(tagData).trim();
        }
        ptr += tagLen;
      }
    }
  }

  let extraFlags = 0;
  if (mobiHeaderLength >= 228) {
    extraFlags = readU16(view, mobiOffset + 226);
  }

  const chunks: Uint8Array[] = [];
  for (let record = 1; record <= textRecordCount && record < recordCount; record += 1) {
    const start = offsets[record];
    const end = offsets[record + 1] ?? bytes.length;
    if (start === undefined) continue;
    let chunk = bytes.slice(start, end);
    if (extraFlags > 0) {
      const cleanLen = getTrailingLength(chunk, extraFlags);
      chunk = chunk.slice(0, cleanLen);
    }
    chunks.push(compression === 2 ? palmDocDecompress(chunk) : chunk);
  }

  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const textBytes = new Uint8Array(totalLength);
  let cursor = 0;
  for (const chunk of chunks) {
    textBytes.set(chunk, cursor);
    cursor += chunk.length;
  }

  const encoding = readU32(view, mobiOffset + 12) === 1252 ? 'windows-1252' : 'utf-8';
  const rawDecoded = new TextDecoder(encoding).decode(textBytes);
  const normalized = rawDecoded.replace(/\u0000/g, '').trim();
  if (!normalized) throw new Error(`This ${label} file has no readable text.`);

  const imageFiles = new Map<string, Uint8Array>();
  if (firstImageRecord > 0 && firstImageRecord < recordCount) {
    for (let record = firstImageRecord; record < recordCount; record += 1) {
      const imgIndex = record - firstImageRecord + 1;
      const start = offsets[record];
      const end = offsets[record + 1] ?? bytes.length;
      const imgBytes = bytes.slice(start, end);
      if (imgBytes.length > 4) {
        const paddedIndex = String(imgIndex).padStart(4, '0');
        imageFiles.set(`image_${imgIndex}`, imgBytes);
        imageFiles.set(`kindle:flow:${paddedIndex}`, imgBytes);
        imageFiles.set(`kindle:embed:${paddedIndex}`, imgBytes);
      }
    }
  }

  let chapters: string[] = [];
  if (/<(?:mbp:pagebreak|div[^>]*class="[^"]*pagebreak[^"]*"|\?xml\b)/i.test(normalized)) {
    const parts = normalized.split(/(?:<mbp:pagebreak[^>]*>|<\?xml[^>]*>|<div[^>]*class="[^"]*pagebreak[^"]*"[^>]*>)/i);
    chapters = parts.map((p) => p.trim()).filter((p) => p.length > 0);
  }
  if (!chapters.length) {
    chapters = [normalized];
  }

  const startChapter = Math.max(0, chapters.findIndex((ch) => stripHtml(ch).length >= 150));
  return {
    title: title || `${label} book`,
    author,
    format,
    chapters,
    chapterPaths: chapters.map((_, i) => `chapter_${i + 1}.html`),
    imageFiles,
    startChapter,
    rawText: normalized,
  };
}

export function parseMobi(buffer: ArrayBuffer): ParsedBook {
  return parsePalmBook(buffer, 'mobi');
}

export function parseAzw3(buffer: ArrayBuffer): ParsedBook {
  return parsePalmBook(buffer, 'azw3');
}

export function formatFromPath(path: string): BookFormat | null {
  const extension = path.toLowerCase().split('.').pop();
  return extension === 'pdf' || extension === 'epub' || extension === 'azw3' || extension === 'mobi' ? extension : null;
}
