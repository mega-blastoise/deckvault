import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  Server,
  Megaphone,
  Flag
} from 'lucide-react';
import { OverviewPanel } from './panels/OverviewPanel';
import { UsersPanel } from './panels/UsersPanel';
import { ContentPanel } from './panels/ContentPanel';
import { SystemPanel } from './panels/SystemPanel';
import { AnnouncementsPanel } from './panels/AnnouncementsPanel';
import { FlagsPanel } from './panels/FlagsPanel';
import './AdminPage.css';

type AdminTab = 'overview' | 'users' | 'content' | 'system' | 'announcements' | 'flags';

const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
  { id: 'users', label: 'Users', icon: <Users size={18} /> },
  { id: 'content', label: 'Content', icon: <FileText size={18} /> },
  { id: 'system', label: 'System', icon: <Server size={18} /> },
  { id: 'announcements', label: 'Announcements', icon: <Megaphone size={18} /> },
  { id: 'flags', label: 'Flags', icon: <Flag size={18} /> }
];

const PANELS: Record<AdminTab, React.ComponentType> = {
  overview: OverviewPanel,
  users: UsersPanel,
  content: ContentPanel,
  system: SystemPanel,
  announcements: AnnouncementsPanel,
  flags: FlagsPanel
};

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const ActivePanel = PANELS[activeTab];

  return (
    <div className="admin-page">
      <aside className="admin-page__sidebar">
        <div className="admin-page__sidebar-header">
          <h2>Admin</h2>
        </div>
        <nav className="admin-page__nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`admin-page__nav-item ${activeTab === tab.id ? 'admin-page__nav-item--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="admin-page__content">
        <ActivePanel />
      </main>
    </div>
  );
}
