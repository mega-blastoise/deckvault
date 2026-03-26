import React, { useEffect, useState, useCallback } from 'react';
import { Trash2, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { MetaDeckAdmin, LgsReportAdmin } from '../../../services/AdminService';
import { AdminService } from '../../../services/AdminService';

const adminService = new AdminService();

type ContentTab = 'meta-decks' | 'reports';

export function ContentPanel() {
  const [tab, setTab] = useState<ContentTab>('meta-decks');

  return (
    <div className="admin-content">
      <div className="admin-content__tabs">
        <button
          className={`admin-content__tab ${tab === 'meta-decks' ? 'admin-content__tab--active' : ''}`}
          onClick={() => setTab('meta-decks')}
        >
          Meta Decks
        </button>
        <button
          className={`admin-content__tab ${tab === 'reports' ? 'admin-content__tab--active' : ''}`}
          onClick={() => setTab('reports')}
        >
          LGS Reports
        </button>
      </div>
      {tab === 'meta-decks' ? <MetaDecksTab /> : <ReportsTab />}
    </div>
  );
}

function MetaDecksTab() {
  const [decks, setDecks] = useState<MetaDeckAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getMetaDecks({ page, limit, q: query || undefined });
      setDecks(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      console.error('[admin] Failed to load meta decks:', err);
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await adminService.deleteMetaDeck(confirmDelete.id);
      setConfirmDelete(null);
      load();
    } catch (err) {
      console.error('[admin] Failed to delete meta deck:', err);
    }
  };

  const exportCsv = () => {
    const headers = ['Name', 'Archetype', 'Format', 'Tier', 'Event', 'Date', 'Cards'];
    const rows = decks.map((d) => [d.name, d.archetype, d.format, d.tier ?? '', d.event_name ?? '', d.event_date ?? '', String(d.card_count)]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meta-decks.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-content__section">
      <div className="admin-content__header">
        <input
          type="text"
          placeholder="Search meta decks..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          className="admin-content__search"
        />
        <button className="admin-btn admin-btn--sm" onClick={exportCsv} title="Export CSV">
          <Download size={14} /> CSV
        </button>
      </div>

      {loading ? (
        <div className="admin-panel__loading">Loading...</div>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Archetype</th>
                <th>Format</th>
                <th>Tier</th>
                <th>Event</th>
                <th>Date</th>
                <th>Cards</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {decks.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.archetype}</td>
                  <td>{d.format}</td>
                  <td>{d.tier ?? '—'}</td>
                  <td>{d.event_name ?? '—'}</td>
                  <td>{d.event_date ?? '—'}</td>
                  <td>{d.card_count}</td>
                  <td>
                    <button
                      className="admin-btn admin-btn--sm admin-btn--danger"
                      onClick={() => setConfirmDelete({ id: d.id, name: d.name })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="admin-pagination">
              <button className="admin-btn admin-btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></button>
              <span>Page {page} of {totalPages}</span>
              <button className="admin-btn admin-btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
            </div>
          )}
        </>
      )}

      {confirmDelete && (
        <div className="admin-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Meta Deck</h3>
            <p>Delete <strong>{confirmDelete.name}</strong>? This will also remove all associated card data.</p>
            <div className="admin-modal__actions">
              <button className="admin-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="admin-btn admin-btn--danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportsTab() {
  const [reports, setReports] = useState<LgsReportAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [format, setFormat] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; archetype: string } | null>(null);
  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getReports({ page, limit, format: format || undefined });
      setReports(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      console.error('[admin] Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, [page, format]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await adminService.deleteReport(confirmDelete.id);
      setConfirmDelete(null);
      load();
    } catch (err) {
      console.error('[admin] Failed to delete report:', err);
    }
  };

  return (
    <div className="admin-content__section">
      <div className="admin-content__header">
        <select
          value={format}
          onChange={(e) => { setFormat(e.target.value); setPage(1); }}
          className="admin-content__filter"
        >
          <option value="">All Formats</option>
          <option value="standard">Standard</option>
          <option value="expanded">Expanded</option>
          <option value="unlimited">Unlimited</option>
        </select>
      </div>

      {loading ? (
        <div className="admin-panel__loading">Loading...</div>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Reporter</th>
                <th>Archetype</th>
                <th>Format</th>
                <th>LGS</th>
                <th>Region</th>
                <th>Result</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.reporter_name}</td>
                  <td>{r.archetype_name}</td>
                  <td>{r.format}</td>
                  <td>{r.lgs_name ?? '—'}</td>
                  <td>{r.region ?? '—'}</td>
                  <td>{r.result ?? '—'}</td>
                  <td>{new Date(r.reported_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="admin-btn admin-btn--sm admin-btn--danger"
                      onClick={() => setConfirmDelete({ id: r.id, archetype: r.archetype_name })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="admin-pagination">
              <button className="admin-btn admin-btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></button>
              <span>Page {page} of {totalPages}</span>
              <button className="admin-btn admin-btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
            </div>
          )}
        </>
      )}

      {confirmDelete && (
        <div className="admin-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Report</h3>
            <p>Delete this <strong>{confirmDelete.archetype}</strong> report?</p>
            <div className="admin-modal__actions">
              <button className="admin-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="admin-btn admin-btn--danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
