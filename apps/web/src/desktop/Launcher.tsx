import type { AppContribution } from '@ayalvasis/sdk';

interface LauncherProps {
  apps: (AppContribution & { moduleId: string })[];
  open(appId: string): void;
}

export function Launcher({ apps, open }: LauncherProps) {
  return <div className="launcher" onPointerDown={(event) => event.stopPropagation()}>
    <h2>Applications</h2>
    {apps.map((app) => <button key={app.id} onClick={() => open(app.id)}>
      {app.icon} {app.title}
    </button>)}
  </div>;
}
