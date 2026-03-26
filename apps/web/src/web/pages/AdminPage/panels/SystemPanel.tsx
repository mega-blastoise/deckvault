import React, { useEffect, useState } from 'react';
import { Database, CheckCircle, Server } from 'lucide-react';
import type { SystemHealth } from '../../../services/AdminService';
import { AdminService } from '../../../services/AdminService';

const adminService = new AdminService();

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

export function SystemPanel() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminService.getSystem()
      .then((res) => setHealth(res.data.data))
      .catch((err) => console.error('[admin] Failed to load system health:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin-panel__loading">Loading system info...</div>;
  if (!health) return <div className="admin-panel__error">Failed to load system health</div>;

  const maxRows = Math.max(1, ...health.tables.map((t) => t.row_count));

  return (
    <div className="admin-system">
      <div className="admin-system__info-cards">
        <div className="admin-system__card">
          <Server size={20} />
          <div>
            <div className="admin-system__card-label">Uptime</div>
            <div className="admin-system__card-value">{formatUptime(health.uptime)}</div>
          </div>
        </div>
        <div className="admin-system__card">
          <Database size={20} />
          <div>
            <div className="admin-system__card-label">PostgreSQL</div>
            <div className="admin-system__card-value">{health.pgVersion}</div>
          </div>
        </div>
        <div className="admin-system__card">
          <Server size={20} />
          <div>
            <div className="admin-system__card-label">Runtime</div>
            <div className="admin-system__card-value">Bun {typeof Bun !== 'undefined' ? Bun.version : 'N/A'}</div>
          </div>
        </div>
      </div>

      <div className="admin-system__section">
        <h3><Database size={16} /> Database Tables</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Table</th>
              <th>Rows</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {health.tables.map((t) => (
              <tr key={t.name}>
                <td><code>{t.name}</code></td>
                <td>{t.row_count.toLocaleString()}</td>
                <td>
                  <div className="admin-system__bar-container">
                    <div
                      className="admin-system__bar"
                      style={{ width: `${(t.row_count / maxRows) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-system__section">
        <h3><CheckCircle size={16} /> Applied Migrations ({health.migrations.length})</h3>
        <table className="admin-table admin-table--compact">
          <thead>
            <tr>
              <th></th>
              <th>Migration</th>
              <th>Applied</th>
            </tr>
          </thead>
          <tbody>
            {health.migrations.map((m) => (
              <tr key={m.name}>
                <td><CheckCircle size={14} className="admin-system__check" /></td>
                <td><code>{m.name}</code></td>
                <td>{new Date(m.applied_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
