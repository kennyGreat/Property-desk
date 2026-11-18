-- Vortexedge Property Desk: single canonical app-state row.
-- The complete app state is stored as JSON so new app fields are not discarded.
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
