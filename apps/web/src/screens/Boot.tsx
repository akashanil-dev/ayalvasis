interface BootProps {
  onSkip(): void;
}

export function Boot({ onSkip }: BootProps) {
  return <main className="boot-screen" onClick={onSkip}>
    <div className="boot-card">
      <div className="boot-logo">λ</div>
      <p>Starting tuxos...</p>
      <div className="boot-log">
        [ OK ] loading kernel<br />
        [ OK ] preparing virtual filesystem<br />
        [ OK ] starting desktop services
      </div>
      <button onClick={onSkip}>Skip boot</button>
    </div>
  </main>;
}
