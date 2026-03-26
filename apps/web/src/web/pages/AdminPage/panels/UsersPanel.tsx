import React, { useEffect, useState, useCallback } from 'react';
import { Search, Shield, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AdminUser, AdminUserDetail } from '../../../services/AdminService';
import { AdminService } from '../../../services/AdminService';

const adminService = new AdminService();

export function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'role' | 'delete'; userId: string; userName: string; currentRole?: string } | null>(null);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getUsers({ page, limit, q: query || undefined, sort: sort || undefined });
      setUsers(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      console.error('[admin] Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, [page, query, sort]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const openUserDetail = async (id: string) => {
    try {
      const res = await adminService.getUser(id);
      setSelectedUser(res.data.data);
    } catch (err) {
      console.error('[admin] Failed to load user detail:', err);
    }
  };

  const handleRoleToggle = async () => {
    if (!confirmAction || confirmAction.type !== 'role') return;
    const newRole = confirmAction.currentRole === 'admin' ? 'user' : 'admin';
    try {
      await adminService.setUserRole(confirmAction.userId, newRole);
      setConfirmAction(null);
      load();
      if (selectedUser?.id === confirmAction.userId) {
        setSelectedUser({ ...selectedUser, role: newRole } as AdminUserDetail);
      }
    } catch (err) {
      console.error('[admin] Failed to toggle role:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirmAction || confirmAction.type !== 'delete') return;
    try {
      await adminService.deleteUser(confirmAction.userId);
      setConfirmAction(null);
      if (selectedUser?.id === confirmAction.userId) setSelectedUser(null);
      load();
    } catch (err) {
      console.error('[admin] Failed to delete user:', err);
    }
  };

  return (
    <div className="admin-users">
      <form className="admin-users__search" onSubmit={handleSearch}>
        <div className="admin-users__search-input-wrap">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="admin-users__search-input"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1); }}
          className="admin-users__sort"
        >
          <option value="">Sort: Newest</option>
          <option value="name">Sort: Name</option>
          <option value="decks">Sort: Decks</option>
          <option value="collection">Sort: Collection</option>
        </select>
      </form>

      {loading ? (
        <div className="admin-panel__loading">Loading users...</div>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Decks</th>
                <th>Collection</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={selectedUser?.id === u.id ? 'admin-table__row--selected' : ''}>
                  <td>
                    <button className="admin-users__name-btn" onClick={() => openUserDetail(u.id)}>
                      {u.name}
                    </button>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`admin-badge admin-badge--${u.role}`}>{u.role}</span>
                  </td>
                  <td>{u.deck_count}</td>
                  <td>{u.collection_count}</td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="admin-table__actions">
                    <button
                      className="admin-btn admin-btn--sm"
                      onClick={() => setConfirmAction({ type: 'role', userId: u.id, userName: u.name, currentRole: u.role })}
                      title={u.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                    >
                      <Shield size={14} />
                    </button>
                    <button
                      className="admin-btn admin-btn--sm admin-btn--danger"
                      onClick={() => setConfirmAction({ type: 'delete', userId: u.id, userName: u.name })}
                      title="Delete user"
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
              <button
                className="admin-btn admin-btn--sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              <span>Page {page} of {totalPages}</span>
              <button
                className="admin-btn admin-btn--sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {selectedUser && (
        <div className="admin-users__detail">
          <h3>User Detail — {selectedUser.name}</h3>
          <div className="admin-users__detail-grid">
            <div><strong>Email:</strong> {selectedUser.email}</div>
            <div><strong>Role:</strong> <span className={`admin-badge admin-badge--${selectedUser.role}`}>{selectedUser.role}</span></div>
            <div><strong>Decks:</strong> {selectedUser.deck_count}</div>
            <div><strong>Collection:</strong> {selectedUser.collection_count}</div>
            <div><strong>Reports:</strong> {selectedUser.report_count}</div>
            <div><strong>Joined:</strong> {new Date(selectedUser.created_at).toLocaleDateString()}</div>
          </div>
          {selectedUser.decks.length > 0 && (
            <>
              <h4>Decks</h4>
              <table className="admin-table admin-table--compact">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Format</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedUser.decks.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td>{d.format}</td>
                      <td>{new Date(d.updated_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <button className="admin-btn admin-btn--sm" onClick={() => setSelectedUser(null)}>Close</button>
        </div>
      )}

      {confirmAction && (
        <div className="admin-modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            {confirmAction.type === 'role' ? (
              <>
                <h3>Change Role</h3>
                <p>
                  {confirmAction.currentRole === 'admin'
                    ? `Demote "${confirmAction.userName}" from admin to user?`
                    : `Promote "${confirmAction.userName}" to admin?`}
                </p>
                <div className="admin-modal__actions">
                  <button className="admin-btn" onClick={() => setConfirmAction(null)}>Cancel</button>
                  <button className="admin-btn admin-btn--primary" onClick={handleRoleToggle}>Confirm</button>
                </div>
              </>
            ) : (
              <>
                <h3>Delete User</h3>
                <p>Permanently delete <strong>{confirmAction.userName}</strong> and all their data (decks, collections, reports)?</p>
                <p className="admin-modal__warning">This action cannot be undone.</p>
                <div className="admin-modal__actions">
                  <button className="admin-btn" onClick={() => setConfirmAction(null)}>Cancel</button>
                  <button className="admin-btn admin-btn--danger" onClick={handleDelete}>Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
