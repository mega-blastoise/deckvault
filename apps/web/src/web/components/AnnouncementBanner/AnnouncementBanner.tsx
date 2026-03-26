import React, { useState, useEffect, useMemo } from 'react';
import { X, Info, AlertTriangle, Wrench, PartyPopper } from 'lucide-react';
import './AnnouncementBanner.css';

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: string;
}

const DISMISSED_KEY = 'dismissed_announcements';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  info: <Info size={16} />,
  warning: <AlertTriangle size={16} />,
  maintenance: <Wrench size={16} />,
  celebration: <PartyPopper size={16} />
};

function getDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function setDismissed(ids: Set<string>) {
  sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissedState] = useState<Set<string>>(new Set());
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    setDismissedState(getDismissed());

    fetch('/api/v1/announcements/active', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.data) setAnnouncements(json.data as Announcement[]);
      })
      .catch(() => {});
  }, []);

  const visible = useMemo(
    () => announcements.filter((a) => !dismissed.has(a.id)),
    [announcements, dismissed]
  );

  if (!isClient || visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissedState(next);
    setDismissed(next);
  };

  return (
    <div className="announcement-banner__container">
      {visible.map((a) => (
        <div key={a.id} className={`announcement-banner announcement-banner--${a.type}`}>
          <span className="announcement-banner__icon">{TYPE_ICONS[a.type] ?? TYPE_ICONS.info}</span>
          <span className="announcement-banner__content">
            <strong>{a.title}</strong> {a.body}
          </span>
          <button
            className="announcement-banner__dismiss"
            onClick={() => dismiss(a.id)}
            aria-label="Dismiss announcement"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
