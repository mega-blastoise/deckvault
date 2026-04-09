import type { FrequencyResponse, ArchetypeFrequency } from '@/web/hooks/useLocalMetaQuery';

export interface LocalMetaPageViewProps {
  format: string;
  archetypes: ArchetypeFrequency[];
  maxCount: number;
  isLoading: boolean;
  data: FrequencyResponse | undefined;
  isAuthenticated: boolean;
  reportModalOpen: boolean;
  onFormatChange: (format: string) => void;
  onOpenReportModal: () => void;
  onCloseReportModal: () => void;
}
