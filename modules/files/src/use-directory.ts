import type { Stat } from '@tuxos/kernel';
import type { SystemClient } from '@tuxos/system';
import { useCallback, useEffect, useState } from 'react';

const REASONS: Record<string, string> = {
  ENOENT: 'No such file or directory',
  EACCES: 'Permission denied',
  ENOTDIR: 'Not a directory',
  EEXIST: 'File exists',
  ENOTEMPTY: 'Directory not empty',
  EPERM: 'Operation not permitted',
};

export function reason(code: string, fallback: string): string {
  return REASONS[code] ?? fallback;
}

/** The entries of one directory, reloaded whenever any file changes, whoever changed it. */
export function useDirectory(system: SystemClient, path: string) {
  const [entries, setEntries] = useState<Stat[]>([]);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!path) return;
    const result = await system.dispatch<Stat[]>('fs.list', { path });
    if (result.ok) {
      setEntries(result.value);
      setError('');
    } else {
      setEntries([]);
      setError(`Can’t open “${path}”: ${reason(result.error.code, result.error.message)}`);
    }
  }, [system, path]);

  useEffect(() => {
    void reload();
    return system.onChange((event) => {
      if (event.action.type.startsWith('fs.')) void reload();
    });
  }, [system, reload]);

  return { entries, error, reload };
}
