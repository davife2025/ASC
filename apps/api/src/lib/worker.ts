import { supabase } from './supabase.js';
import { runInvestigation } from './agent.js';

const POLL_INTERVAL_MS = 5_000;
const MAX_CONCURRENT = 3;
// FIX: use wall-clock time threshold based on when the investigation was last
// updated, not when it was created — an investigation can sit 'pending' for
// a long time before being picked up; we only want to recover ones stuck in
// 'running' that haven't been updated in >10 minutes.
const STUCK_THRESHOLD_MS = 10 * 60_000;

let running = false;
let activeCount = 0;

export function startWorker(): void {
  if (running) return;
  running = true;
  console.log('[worker] started — polling every', POLL_INTERVAL_MS, 'ms');
  poll();
}

export function stopWorker(): void {
  running = false;
}

async function poll(): Promise<void> {
  if (!running) return;
  try {
    await drain();
  } catch (err) {
    console.error('[worker] poll error:', err);
  }
  setTimeout(poll, POLL_INTERVAL_MS);
}

async function drain(): Promise<void> {
  if (activeCount >= MAX_CONCURRENT) return;

  const slots = MAX_CONCURRENT - activeCount;
  const { data: pending } = await supabase
    .from('investigations')
    .select('id')
    .eq('status', 'pending')
    .order('started_at', { ascending: true })
    .limit(slots);

  if (!pending?.length) return;

  for (const { id } of pending) {
    activeCount++;
    runInvestigation(id).finally(() => { activeCount--; });
  }
}

export async function recoverStuckInvestigations(): Promise<void> {
  // FIX: recover on completed_at absence + started_at older than threshold
  // `started_at` is set when investigation is created; if it's been running
  // for >10 min without a completed_at, something crashed.
  const threshold = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

  const { data, error } = await supabase
    .from('investigations')
    .update({ status: 'pending', error: null })
    .eq('status', 'running')
    .lt('started_at', threshold)
    .is('completed_at', null)
    .select('id');

  if (error) {
    console.error('[worker] recovery failed:', error.message);
    return;
  }

  if (data?.length) {
    console.log(`[worker] recovered ${data.length} stuck investigation(s):`, data.map(d => d.id));
  }
}
