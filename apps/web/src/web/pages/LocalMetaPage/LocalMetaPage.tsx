import React, { useState } from 'react';
import { useAuth } from '../../contexts/Auth';
import { useLocalMetaQuery } from '../../hooks/useLocalMetaQuery';
import { pipeline } from '../../utils/pipeline';
import { LocalMetaPageView } from './View';
import './LocalMetaPage.css';

function LocalMetaPageComponent() {
  const { isAuthenticated } = useAuth();
  const [format, setFormat] = useState('standard');
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const { data, isLoading } = useLocalMetaQuery({ format });

  const archetypes = data?.archetypes ?? [];
  const maxCount = archetypes.length > 0 ? (archetypes[0]?.reportCount ?? 1) : 1;

  return (
    <LocalMetaPageView
      format={format}
      archetypes={archetypes}
      maxCount={maxCount}
      isLoading={isLoading}
      data={data}
      isAuthenticated={isAuthenticated}
      reportModalOpen={reportModalOpen}
      onFormatChange={setFormat}
      onOpenReportModal={() => setReportModalOpen(true)}
      onCloseReportModal={() => setReportModalOpen(false)}
    />
  );
}

export const LocalMetaPage = pipeline(React.memo)(LocalMetaPageComponent);
