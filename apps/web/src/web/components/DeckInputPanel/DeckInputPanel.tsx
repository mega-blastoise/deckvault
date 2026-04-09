import React, { useState } from 'react';
import type { DeckInputMode, DeckInputPanelProps } from './types';
import { DeckInputPanelView } from './DeckInputPanelView';
import './DeckInputPanel.css';

export function DeckInputPanel(props: DeckInputPanelProps) {
  const defaultMode: DeckInputMode = props.showMetaOnly ? 'meta' : 'saved';
  const [activeMode, setActiveMode] = useState<DeckInputMode>(defaultMode);

  return (
    <DeckInputPanelView
      {...props}
      activeMode={activeMode}
      onModeChange={setActiveMode}
    />
  );
}
