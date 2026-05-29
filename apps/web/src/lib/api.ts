import type { Incident, Investigation, PaginatedResponse } from '@sre/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Request failed');
  return json as T;
}

export const api = {
  incidents: {
    list: (params?: { status?: string; severity?: string; page?: number }) => {
      const qs = new URLSearchParams(
        Object.entries(params ?? {})
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)])
      ).toString();
      return request<PaginatedResponse<Incident>>(`/incidents${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => request<{ data: Incident }>(`/incidents/${id}`),
    sync: () => request<{ data: { synced: number } }>('/incidents/sync', { method: 'POST' }),
  },

  investigations: {
    list: (params?: { incident_id?: string; status?: string }) => {
      const qs = new URLSearchParams(
        Object.entries(params ?? {})
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)])
      ).toString();
      return request<PaginatedResponse<Investigation>>(`/investigations${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => request<{ data: Investigation }>(`/investigations/${id}`),
    trigger: (incidentId: string) =>
      request<{ data: Investigation }>('/investigations', {
        method: 'POST',
        body: JSON.stringify({ incident_id: incidentId }),
      }),
    retry: (id: string) =>
      request<{ data: { id: string; status: string } }>(`/investigations/${id}/retry`, {
        method: 'POST',
      }),
  },
};
