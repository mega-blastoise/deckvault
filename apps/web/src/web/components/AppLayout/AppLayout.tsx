import React from 'react';
import { Navbar } from '../Navbar';
import { AppFooter } from '../AppFooter';
import { AnnouncementBanner } from '../AnnouncementBanner';
import { ToastProvider } from '@/web/contexts/Toast';
import './AppLayout.css';

export interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <ToastProvider>
      <div className="app-layout">
        <AnnouncementBanner />
        <Navbar />
        <main className="app-layout__main">
          <div className="app-layout__container">{children}</div>
        </main>
        <AppFooter />
      </div>
    </ToastProvider>
  );
}
