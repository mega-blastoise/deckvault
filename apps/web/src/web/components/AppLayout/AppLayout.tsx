import React from 'react';
import { Navbar } from '../Navbar';
import { AppFooter } from '../AppFooter';
import './AppLayout.css';

export interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-layout">
      <Navbar />
      <main className="app-layout__main">
        <div className="app-layout__container">{children}</div>
      </main>
      <AppFooter />
    </div>
  );
}
