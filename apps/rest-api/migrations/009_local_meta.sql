CREATE TABLE lgs_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archetype    VARCHAR(80) NOT NULL,
  archetype_name VARCHAR(120) NOT NULL,
  format       VARCHAR(20) NOT NULL,
  lgs_name     VARCHAR(200),
  region       VARCHAR(100),
  result       VARCHAR(10),
  reported_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lgs_reports_archetype ON lgs_reports(archetype);
CREATE INDEX idx_lgs_reports_format ON lgs_reports(format);
CREATE INDEX idx_lgs_reports_reported_at ON lgs_reports(reported_at);
CREATE INDEX idx_lgs_reports_user_id ON lgs_reports(user_id);

CREATE VIEW local_meta_frequency AS
SELECT
  archetype,
  archetype_name,
  format,
  COUNT(*)                                    AS report_count,
  COUNT(*) FILTER (WHERE result = 'win')      AS win_count,
  COUNT(*) FILTER (WHERE result = 'loss')     AS loss_count,
  COUNT(*) FILTER (WHERE result = 'tie')      AS tie_count,
  MAX(reported_at)                            AS last_seen
FROM lgs_reports
WHERE reported_at >= NOW() - INTERVAL '30 days'
GROUP BY archetype, archetype_name, format
ORDER BY report_count DESC;
