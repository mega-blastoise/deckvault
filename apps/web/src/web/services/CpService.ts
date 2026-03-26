export interface CpEntry {
  id: string;
  user_id: string;
  event_name: string;
  event_date: string;
  placement: string | null;
  cp_earned: number;
  format: string;
  notes: string | null;
  created_at: string;
}

export interface CpListResponse {
  entries: CpEntry[];
  totalCp: number;
  season: string;
}

export interface CreateCpEntryInput {
  eventName: string;
  eventDate: string;
  placement?: string;
  cpEarned: number;
  format: string;
  notes?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const CpService = {
  list(season?: string): Promise<CpListResponse> {
    const sp = season ? `?season=${season}` : '';
    return request<CpListResponse>(`/api/v1/cp${sp}`);
  },

  create(input: CreateCpEntryInput): Promise<CpEntry> {
    return request<CpEntry>('/api/v1/cp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: input.eventName,
        eventDate: input.eventDate,
        placement: input.placement || undefined,
        cpEarned: input.cpEarned,
        format: input.format,
        notes: input.notes || undefined
      })
    });
  },

  delete(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/v1/cp/${id}`, { method: 'DELETE' });
  }
};
