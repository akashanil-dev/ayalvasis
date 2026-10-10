import { useEffect, useState } from 'react';

/** The current time, updated every few seconds. */
export function useNow(intervalMs = 10_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export const timeText = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const dateText = (date: Date) => date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
/** KDE Plasma's panel clock date: "11/10/26". */
export const numericDateText = (date: Date) =>
  date.toLocaleDateString([], { day: 'numeric', month: 'numeric', year: '2-digit' });
/** Waybar's clock: "Sun 11  03:05". */
export const waybarClockText = (date: Date) =>
  `${date.toLocaleDateString([], { weekday: 'short', day: '2-digit' })}  ${timeText(date)}`;
/** GNOME's top bar style: "Sat 11 Oct  03:05". */
export const gnomeClockText = (date: Date) =>
  `${date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}  ${timeText(date)}`;
