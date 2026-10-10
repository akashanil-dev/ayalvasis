import type { Stat } from '@tuxos/kernel';
import { formatSize, formatTime } from './model';

interface FileTableProps {
  entries: Stat[];
  selected: string | null;
  onSelect(name: string): void;
  onOpen(entry: Stat): void;
}

export function FileTable({ entries, selected, onSelect, onOpen }: FileTableProps) {
  if (!entries.length) return <p className="files-empty">This folder is empty.</p>;
  return <div className="files-scroll"><table className="files-table">
    <thead>
      <tr><th>Name</th><th>Size</th><th>Modified</th></tr>
    </thead>
    <tbody>
      {entries.map((entry) => <tr
        key={entry.name}
        className={entry.name === selected ? 'selected' : ''}
        aria-selected={entry.name === selected}
        tabIndex={0}
        onClick={() => onSelect(entry.name)}
        onDoubleClick={() => onOpen(entry)}
        onKeyDown={(event) => { if (event.key === 'Enter') onOpen(entry); }}
        onFocus={() => onSelect(entry.name)}
      >
        <td>
          <span className={`files-kind files-kind-${entry.kind}`} aria-hidden="true">
            {entry.kind === 'dir' ? '📁' : '📄'}
          </span>
          {entry.name}
        </td>
        <td>{formatSize(entry)}</td>
        <td>{formatTime(entry.mtime)}</td>
      </tr>)}
    </tbody>
  </table></div>;
}
