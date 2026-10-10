import type { AppViewProps, SystemClient } from '@ayalvasis/system';
import { useEffect, useRef, useState } from 'react';
import { explain, nextQuestion, octal, parseOctal, points, ROUND_SECONDS, symbolic, type Question } from './game';
import './arcade.css';

type Phase = 'ready' | 'playing' | 'over';

export default function ArcadeView({ system }: AppViewProps) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [question, setQuestion] = useState<Question>(() => nextQuestion(Math.random));
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [left, setLeft] = useState(ROUND_SECONDS);
  const [feedback, setFeedback] = useState<{ good: boolean; text: string } | null>(null);
  const best = useBestScore(system);

  useEffect(() => {
    if (phase !== 'playing') return;
    if (left <= 0) {
      setPhase('over');
      best.record(score);
      return;
    }
    const timer = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, left]);

  function start() {
    setScore(0);
    setStreak(0);
    setLeft(ROUND_SECONDS);
    setFeedback(null);
    setQuestion(nextQuestion(Math.random));
    setPhase('playing');
  }

  function answer(mode: number | undefined) {
    if (mode === undefined) return setFeedback({ good: false, text: 'Type three digits from 0 to 7, like 755.' });
    const right = mode === question.mode;
    setFeedback(right
      ? { good: true, text: `+${points(streak)}  ${symbolic(question.mode)} is ${octal(question.mode)}` }
      : { good: false, text: `${symbolic(question.mode)} is ${octal(question.mode)}: ${explain(question.mode)}` });
    if (right) setScore(score + points(streak));
    setStreak(right ? streak + 1 : 0);
    setQuestion(nextQuestion(Math.random, question));
  }

  return <div className="arcade-view">
    <header className="arcade-bar">
      <span>Score <strong>{score}</strong></span>
      <span>Streak <strong>{streak}</strong></span>
      <span>Best <strong>{best.value ?? '—'}</strong></span>
      <span className={left <= 10 ? 'arcade-hurry' : ''}>⏱ <strong>{left}s</strong></span>
    </header>
    {phase === 'ready' && <Intro onStart={start} />}
    {phase === 'over' && <div className="arcade-center">
      <h2>Time!</h2>
      <p className="arcade-big">{score} points</p>
      {best.value !== null && score >= best.value && score > 0 && <p>🏆 New best score!</p>}
      <button className="arcade-primary" onClick={start} autoFocus>Play again</button>
    </div>}
    {phase === 'playing' && (question.kind === 'to-octal'
      ? <ToOctal question={question} onAnswer={answer} />
      : <ToSymbolic key={question.mode} question={question} onAnswer={answer} />)}
    {feedback && phase !== 'ready' && <p className={`arcade-feedback ${feedback.good ? 'good' : 'bad'}`} role="status">
      {feedback.text}
    </p>}
  </div>;
}

function Intro({ onStart }: { onStart(): void }) {
  return <div className="arcade-center">
    <h2>chmod Arcade</h2>
    <p>Every file has permissions for its owner, its group and everyone else: read (4), write (2) and run (1).
      Add them up per group to get the number chmod uses, so <code>rwxr-x---</code> is <code>750</code>.</p>
    <p>You have {ROUND_SECONDS} seconds. Answers in a row earn bonus points.</p>
    <button className="arcade-primary" onClick={onStart} autoFocus>Start</button>
  </div>;
}

function ToOctal({ question, onAnswer }: { question: Question; onAnswer(mode: number | undefined): void }) {
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), [question]);
  return <form className="arcade-center" onSubmit={(event) => {
    event.preventDefault();
    onAnswer(parseOctal(typed));
    setTyped('');
  }}>
    <p>What number is this?</p>
    <p className="arcade-big arcade-mono">{symbolic(question.mode)}</p>
    <input
      ref={input}
      aria-label="Octal permissions"
      className="arcade-input"
      inputMode="numeric"
      maxLength={4}
      value={typed}
      onChange={(event) => setTyped(event.target.value)}
    />
    <button className="arcade-primary" type="submit">Check</button>
  </form>;
}

function ToSymbolic({ question, onAnswer }: { question: Question; onAnswer(mode: number | undefined): void }) {
  const [bits, setBits] = useState(0);
  return <div className="arcade-center">
    <p>Switch on the permissions for <code>chmod {octal(question.mode)}</code></p>
    <div className="arcade-grid" role="group" aria-label="Permission bits">
      {['owner', 'group', 'others'].map((who, row) => <div key={who} className="arcade-row">
        <span>{who}</span>
        {['r', 'w', 'x'].map((letter, column) => {
          const bit = 1 << (8 - (row * 3 + column));
          return <button
            key={letter}
            aria-pressed={(bits & bit) !== 0}
            aria-label={`${who} ${letter}`}
            onClick={() => setBits(bits ^ bit)}
          >{bits & bit ? letter : '-'}</button>;
        })}
      </div>)}
    </div>
    <button className="arcade-primary" onClick={() => onAnswer(bits)}>Check</button>
  </div>;
}

/** The best score lives in ~/.local/share/ayalvasis/chmod-arcade.json, like any app's saved data. */
function useBestScore(system: SystemClient) {
  const [value, setValue] = useState<number | null>(null);
  const [file, setFile] = useState('');

  useEffect(() => {
    void system.user().then(async (user) => {
      const path = `/home/${user}/.local/share/ayalvasis/chmod-arcade.json`;
      setFile(path);
      const saved = await system.dispatch<string>('fs.read', { path });
      if (!saved.ok) return;
      try {
        const best = (JSON.parse(saved.value) as { best?: unknown }).best;
        if (typeof best === 'number') setValue(best);
      } catch {
        // An unreadable score file is treated as no score yet.
      }
    });
  }, [system]);

  return {
    value,
    record(score: number) {
      if (!file || (value !== null && score <= value)) return;
      setValue(score);
      void system.dispatch('fs.mkdir', { path: file.slice(0, file.lastIndexOf('/')), parents: true })
        .then(() => system.dispatch('fs.write', { path: file, content: `${JSON.stringify({ best: score })}\n` }));
    },
  };
}
