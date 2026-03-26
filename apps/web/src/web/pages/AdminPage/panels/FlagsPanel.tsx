import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FeatureFlag } from '../../../services/AdminService';
import { AdminService } from '../../../services/AdminService';

const adminService = new AdminService();

export function FlagsPanel() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ key: '', description: '', enabled: false });
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; key: string } | null>(null);

  const load = async () => {
    try {
      const res = await adminService.getFlags();
      setFlags(res.data.data);
    } catch (err) {
      console.error('[admin] Failed to load flags:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (flag: FeatureFlag) => {
    try {
      await adminService.toggleFlag(flag.id, !flag.enabled);
      setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, enabled: !f.enabled } : f));
    } catch (err) {
      console.error('[admin] Failed to toggle flag:', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminService.createFlag(createForm);
      setShowCreate(false);
      setCreateForm({ key: '', description: '', enabled: false });
      load();
    } catch (err) {
      console.error('[admin] Failed to create flag:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await adminService.deleteFlag(confirmDelete.id);
      setConfirmDelete(null);
      load();
    } catch (err) {
      console.error('[admin] Failed to delete flag:', err);
    }
  };

  if (loading) return <div className="admin-panel__loading">Loading feature flags...</div>;

  return (
    <div className="admin-flags">
      <div className="admin-flags__header">
        <h3>Feature Flags ({flags.length})</h3>
        <button className="admin-btn admin-btn--primary" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> New Flag
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Description</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.id}>
              <td><code>{f.key}</code></td>
              <td>{f.description ?? '—'}</td>
              <td>
                <button
                  className={`admin-toggle ${f.enabled ? 'admin-toggle--on' : ''}`}
                  onClick={() => handleToggle(f)}
                  aria-label={`${f.enabled ? 'Disable' : 'Enable'} ${f.key}`}
                >
                  <span className="admin-toggle__knob" />
                </button>
              </td>
              <td>{new Date(f.updated_at).toLocaleString()}</td>
              <td>
                <button
                  className="admin-btn admin-btn--sm admin-btn--danger"
                  onClick={() => setConfirmDelete({ id: f.id, key: f.key })}
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showCreate && (
        <div className="admin-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create Feature Flag</h3>
            <form onSubmit={handleCreate} className="admin-form">
              <label className="admin-form__field">
                <span>Key (snake_case)</span>
                <input
                  type="text"
                  value={createForm.key}
                  onChange={(e) => setCreateForm({ ...createForm, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  required
                  pattern="[a-z0-9_]+"
                  placeholder="my_feature_flag"
                />
              </label>
              <label className="admin-form__field">
                <span>Description</span>
                <input
                  type="text"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="What this flag controls"
                />
              </label>
              <label className="admin-form__field admin-form__field--inline">
                <input
                  type="checkbox"
                  checked={createForm.enabled}
                  onChange={(e) => setCreateForm({ ...createForm, enabled: e.target.checked })}
                />
                <span>Enabled by default</span>
              </label>
              <div className="admin-modal__actions">
                <button type="button" className="admin-btn" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn--primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="admin-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Flag</h3>
            <p>Delete flag <code>{confirmDelete.key}</code>? This cannot be undone.</p>
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
