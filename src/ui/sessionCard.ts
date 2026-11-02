import { $ } from './dom';

export interface SessionSummary {
  task: string;
  minutes: number;
  todayMinutes: number;
  streak: number;
}

/** A small card after each focus block: what was done, and how the day is going. */
export function createSessionCard(): { show(summary: SessionSummary): void; hide(): void } {
  const card = $('#sessionCard');
  const hide = (): void => {
    card.classList.add('hidden');
    card.inert = true;
  };
  $('#btnCardClose').addEventListener('click', hide);
  return {
    show({ task, minutes, todayMinutes, streak }) {
      $('#cardTask').textContent = task || 'Focus session';
      $('#cardMinutes').textContent = `${Math.round(minutes)} min`;
      $('#cardToday').textContent = `${Math.round(todayMinutes)} min today`;
      $('#cardStreak').textContent = streak === 1 ? '1-day streak' : `${streak}-day streak`;
      card.classList.remove('hidden');
      card.inert = false;
    },
    hide
  };
}
