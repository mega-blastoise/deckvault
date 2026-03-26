import React, { useEffect, useState, useMemo } from 'react';
import { Users, Layers, Library, Swords, FileText, TrendingUp } from 'lucide-react';
import type { AdminStats, ActivityEvent } from '../../../services/AdminService';
import { AdminService } from '../../../services/AdminService';

const adminService = new AdminService();

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  user_signup: <Users size={14} />,
  deck_created: <Layers size={14} />,
  report_submitted: <Swords size={14} />
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function OverviewPanel() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [statsRes, activityRes] = await Promise.all([
          adminService.getStats(),
          adminService.getActivity(50)
        ]);
        if (!cancelled) {
          setStats(statsRes.data.data);
          setActivity(activityRes.data.data);
        }
      } catch (err) {
        console.error('[admin] Failed to load overview:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    const interval = setInterval(() => {
      adminService.getActivity(50).then((res) => {
        if (!cancelled) setActivity(res.data.data);
      }).catch(() => {});
    }, 60000);

    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const maxSignup = useMemo(() => {
    if (!stats?.signupTrend) return 1;
    return Math.max(1, ...stats.signupTrend.map((p) => p.count));
  }, [stats]);

  if (loading) {
    return <div className="admin-panel__loading">Loading overview...</div>;
  }

  if (!stats) {
    return <div className="admin-panel__error">Failed to load stats</div>;
  }

  return (
    <div className="admin-overview">
      <div className="admin-overview__stats">
        <StatCard icon={<Users size={20} />} label="Users" value={stats.userCount} badge={stats.signupsToday > 0 ? `+${stats.signupsToday} today` : undefined} color="blue" />
        <StatCard icon={<Layers size={20} />} label="Decks" value={stats.deckCount} color="purple" />
        <StatCard icon={<Library size={20} />} label="Collection Entries" value={stats.collectionEntries} color="yellow" />
        <StatCard icon={<Swords size={20} />} label="Meta Decks" value={stats.metaDeckCount} color="green" />
        <StatCard icon={<FileText size={20} />} label="LGS Reports" value={stats.reportCount} color="red" />
      </div>

      <div className="admin-overview__row">
        <div className="admin-overview__trend">
          <h3><TrendingUp size={16} /> Signups — Last 30 Days <span className="admin-overview__trend-total">(+{stats.signupsWeek} this week)</span></h3>
          <div className="admin-overview__chart">
            {stats.signupTrend.map((point) => (
              <div key={point.date} className="admin-overview__bar-col" title={`${point.date}: ${point.count}`}>
                <div
                  className="admin-overview__bar"
                  style={{ height: `${(point.count / maxSignup) * 100}%` }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="admin-overview__activity">
          <h3>Recent Activity</h3>
          <div className="admin-overview__feed">
            {activity.length === 0 && <p className="admin-overview__empty">No recent activity</p>}
            {activity.map((event, i) => (
              <div key={`${event.entity_id}-${i}`} className={`admin-overview__event admin-overview__event--${event.type}`}>
                <span className="admin-overview__event-icon">{ACTIVITY_ICONS[event.type] ?? <FileText size={14} />}</span>
                <span className="admin-overview__event-text">
                  <strong>{event.actor_name ?? event.actor_email ?? 'Unknown'}</strong>{' '}
                  {event.description}
                </span>
                <span className="admin-overview__event-time">{timeAgo(event.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {stats.topUsers.length > 0 && (
        <div className="admin-overview__top-users">
          <h3>Top Users by Engagement</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Decks</th>
                <th>Collection</th>
                <th>Reports</th>
              </tr>
            </thead>
            <tbody>
              {stats.topUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.deck_count}</td>
                  <td>{u.collection_count}</td>
                  <td>{u.report_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, badge, color }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  badge?: string;
  color: string;
}) {
  return (
    <div className={`admin-stat admin-stat--${color}`}>
      <div className="admin-stat__icon">{icon}</div>
      <div className="admin-stat__info">
        <span className="admin-stat__value">{value.toLocaleString()}</span>
        <span className="admin-stat__label">{label}</span>
      </div>
      {badge && <span className="admin-stat__badge">{badge}</span>}
    </div>
  );
}
