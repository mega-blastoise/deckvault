import React from 'react';
import type { SimulationConfigProps } from './types';
import { SimulationConfigView } from './SimulationConfigView';
import './SimulationConfig.css';

export function SimulationConfig(props: SimulationConfigProps) {
  return <SimulationConfigView {...props} />;
}
