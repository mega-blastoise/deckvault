import React from 'react';

import { BrowserDataLayer } from './browser/BrowserDataLayer';
import { ServerDataLayer } from './server/ServerDataLayer';

import type { DataLayerProps } from './types';

function DataLayer({ children, javascriptRuntime, browser, server }: DataLayerProps) {
  if (javascriptRuntime === 'server') {
    if (!server) {
      throw new Error('DataLayer: server props are required when javascriptRuntime is "server"');
    }
    return <ServerDataLayer client={server.client}>{children}</ServerDataLayer>;
  }

  if (!browser) {
    throw new Error('DataLayer: browser props are required when javascriptRuntime is "browser"');
  }

  return (
    <BrowserDataLayer client={browser.client} state={browser.state}>
      {children}
    </BrowserDataLayer>
  );
}

const DataLayerMemo = React.memo(DataLayer);

export { DataLayerMemo as DataLayer };
