type UpdateState = 'checking' | 'downloading' | 'ready' | 'idle' | 'failed';

let preparedUpdate: { install: () => Promise<void> } | null = null;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function prepareUpdate(onState: (state: UpdateState, progress?: number) => void): Promise<void> {
  if (!isTauri()) return;
  try {
    onState('checking');
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: 1800 });
    if (!update) { onState('idle'); return; }
    onState('downloading', 0);
    await update.download((event) => {
      if (event.event === 'Progress') onState('downloading', event.data.chunkLength);
    }, { timeout: 15_000 });
    preparedUpdate = update;
    onState('ready');
  } catch {
    onState('failed');
  }
}

export async function installPreparedUpdate(): Promise<boolean> {
  if (!preparedUpdate) return false;
  await preparedUpdate.install();
  preparedUpdate = null;
  return true;
}

export function hasPreparedUpdate(): boolean {
  return Boolean(preparedUpdate);
}
