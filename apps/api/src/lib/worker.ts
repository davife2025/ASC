import { supabase } from './supabase.js';
import { runInvestigation } from './agent.js';
import { coral } from './coral.js';

const POLL_INTERVAL_MS = 5_000;
const MAX_CONCURRENT = 3;
const STUCK_THRESHOLD_MS = 10 * 60_000;

let running = false;
let activeCount = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

export function startWorker(): void {
  if (running) return;
  running = true;
  console.log('[worker] started — polling every', POLL_INTERVAL_MS, 'ms');
  schedulePoll();
}

export function stopWorker(): void {
  running = false;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  console.log('[worker] stopped');
}

function schedulePoll(): void {
  pollTimer = setTimeout(async () => {
    if (!running) return;
    try { await drain(); } catch (err) { console.error('[worker] poll error:', err); }
    if (running) schedulePoll();
  }, POLL_INTERVAL_MS);
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

/** Reset investigations stuck in 'running' for >10 min (now uses updated_at) */
export async function recoverStuckInvestigations(): Promise<void> {
  const threshold = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

  const { data, error } = await supabase
    .from('investigations')
    .update({ status: 'pending', error: null })
    .eq('status', 'running')
    .lt('updated_at', threshold)     // updated_at now exists on the table
    .is('completed_at', null)
    .select('id');

  if (error) { console.error('[worker] recovery failed:', error.message); return; }
  if (data?.length) {
    console.log(`[worker] recovered ${data.length} stuck investigation(s):`, data.map(d => d.id));
  }
}

/** Graceful shutdown — wait for active investigations to finish (up to maxWaitMs) */
export async function gracefulShutdown(maxWaitMs = 15_000): Promise<void> {
  console.log('[worker] shutting down…');
  stopWorker();

  const deadline = Date.now() + maxWaitMs;
  while (activeCount > 0 && Date.now() < deadline) {
    console.log(`[worker] waiting for ${activeCount} active investigation(s)…`);
    await new Promise(r => setTimeout(r, 500));
  }

  if (activeCount > 0) {
    console.warn(`[worker] ${activeCount} investigation(s) still running at shutdown — will be recovered on next start`);
  }

  coral.disconnect();
  console.log('[worker] shutdown complete');
}
