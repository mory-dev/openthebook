import { parseAzw3, parseEpub, parseMobi, type ParsedBook } from './formats';

type WorkerFormat = 'epub' | 'azw3' | 'mobi';

type ParseRequest = {
  buffer: ArrayBuffer;
  format: WorkerFormat;
};

type ParseResponse = {
  error?: string;
  parsed?: ParsedBook;
};

type BookWorkerScope = {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null;
  postMessage: (message: ParseResponse, transfer?: Transferable[]) => void;
};

const scope = globalThis as unknown as BookWorkerScope;

function transferableImages(parsed: ParsedBook): Transferable[] {
  const buffers = new Set<ArrayBuffer>();
  for (const bytes of parsed.imageFiles?.values() ?? []) {
    if (bytes.buffer instanceof ArrayBuffer) buffers.add(bytes.buffer);
  }
  return [...buffers];
}

scope.onmessage = async ({ data }: MessageEvent<ParseRequest>) => {
  try {
    const parsed = data.format === 'epub'
      ? await parseEpub(data.buffer)
      : data.format === 'azw3'
        ? parseAzw3(data.buffer)
        : parseMobi(data.buffer);
    scope.postMessage({ parsed }, transferableImages(parsed));
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'That book could not be opened.' });
  }
};
