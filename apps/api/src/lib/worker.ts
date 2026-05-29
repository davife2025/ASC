import { supabase } from './supabase.js';
import { runInvestigation } from './agent.js';

const POLL_INTERVAL_MS = 5_000;
const MAX_CONCURRENT = 3;

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
  console.log('[worker] stopped');
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
    runInvestigation(id).finally(() => {
      activeCount--;
    });
  }
}

// Also recover any investigations stuck in "running" for >10 minutes
// (e.g. from a previous crashed process)
export async function recoverStuckInvestigations(): Promise<void> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('investigations')
    .update({ status: 'pending' })
    .eq('status', 'running')
    .lt('started_at', tenMinutesAgo)
    .select();

  if (error) {
    console.error('[worker] recovery query failed:', error.message);
    return;
  }

  if (data?.length) {
    console.log(`[worker] recovered ${data.length} stuck investigation(s)`);
  }
}
