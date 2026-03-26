import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit, Eye } from 'lucide-react';
import type { Announcement } from '../../../services/AdminService';
import { AdminService } from '../../../services/AdminService';

const adminService = new AdminService();

const TYPE_OPTIONS = ['info', 'warning', 'maintenance', 'celebration'] as const;

interface FormState {
  title: string;
  body: string;
  type: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
}

const emptyForm: FormState = {
  title: '',
  body: '',
  type: 'info',
  isActive: true,
  startsAt: new Date().toISOString().slice(0, 16),
  endsAt: ''
};

export function AnnouncementsPanel() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [preview, setPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  const load = async () => {
    try {
      const res = await adminService.getAnnouncements();
      setAnnouncements(res.data.data);
    } catch (err) {
      console.error('[admin] Failed to load announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setPreview(false);
  };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({
      title: a.title,
      body: a.body,
      type: a.type,
      isActive: a.is_active,
      startsAt: a.starts_at ? new Date(a.starts_at).toISOString().slice(0, 16) : '',
      endsAt: a.ends_at ? new Date(a.ends_at).toISOString().slice(0, 16) : ''
    });
    setShowForm(true);
    setPreview(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: form.title,
      body: form.body,
      type: form.type,
      isActive: form.isActive,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null
    };
    try {
      if (editingId) {
        await adminService.updateAnnouncement(editingId, payload);
      } else {
        await adminService.createAnnouncement(payload);
      }
      setShowForm(false);
      load();
    } catch (err) {
      console.error('[admin] Failed to save announcement:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await adminService.deleteAnnouncement(confirmDelete.id);
      setConfirmDelete(null);
      load();
    } catch (err) {
      console.error('[admin] Failed to delete announcement:', err);
    }
  };

  function getStatusLabel(a: Announcement): string {
    if (!a.is_active) return 'Inactive';
    const now = Date.now();
    const start = new Date(a.starts_at).getTime();
    if (start > now) return 'Scheduled';
    if (a.ends_at && new Date(a.ends_at).getTime() < now) return 'Expired';
    return 'Active';
  }

  if (loading) return <div className="admin-panel__loading">Loading announcements...</div>;

  return (
    <div className="admin-announcements">
      <div className="admin-announcements__header">
        <h3>Announcements ({announcements.length})</h3>
        <button className="admin-btn admin-btn--primary" onClick={openCreate}>
          <Plus size={14} /> New Announcement
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Status</th>
            <th>Starts</th>
            <th>Ends</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {announcements.map((a) => {
            const status = getStatusLabel(a);
            return (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td><span className={`admin-badge admin-badge--${a.type}`}>{a.type}</span></td>
                <td><span className={`admin-badge admin-badge--${status.toLowerCase()}`}>{status}</span></td>
                <td>{new Date(a.starts_at).toLocaleString()}</td>
                <td>{a.ends_at ? new Date(a.ends_at).toLocaleString() : '—'}</td>
                <td className="admin-table__actions">
                  <button className="admin-btn admin-btn--sm" onClick={() => openEdit(a)}><Edit size={14} /></button>
                  <button className="admin-btn admin-btn--sm admin-btn--danger" onClick={() => setConfirmDelete({ id: a.id, title: a.title })}><Trash2 size={14} /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {showForm && (
        <div className="admin-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="admin-modal admin-modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? 'Edit Announcement' : 'New Announcement'}</h3>

            {preview ? (
              <div className="admin-announcements__preview">
                <div className={`announcement-banner announcement-banner--${form.type}`}>
                  <span className="announcement-banner__content">
                    <strong>{form.title}</strong> {form.body}
                  </span>
                </div>
                <button className="admin-btn admin-btn--sm" onClick={() => setPreview(false)}>Back to Edit</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="admin-form">
                <label className="admin-form__field">
                  <span>Title</span>
                  <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </label>
                <label className="admin-form__field">
                  <span>Body</span>
                  <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required rows={3} />
                </label>
                <label className="admin-form__field">
                  <span>Type</span>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="admin-form__field admin-form__field--inline">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  <span>Active</span>
                </label>
                <label className="admin-form__field">
                  <span>Starts At</span>
                  <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required />
                </label>
                <label className="admin-form__field">
                  <span>Ends At (optional)</span>
                  <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
                </label>
                <div className="admin-modal__actions">
                  <button type="button" className="admin-btn" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
                  <button type="button" className="admin-btn" onClick={() => setShowForm(false)}>Cancel</button>
                  <button type="submit" className="admin-btn admin-btn--primary">{editingId ? 'Update' : 'Create'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="admin-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Announcement</h3>
            <p>Delete <strong>{confirmDelete.title}</strong>?</p>
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
