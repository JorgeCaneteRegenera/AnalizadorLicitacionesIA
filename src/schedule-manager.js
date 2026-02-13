// ============================================================
// SCHEDULE MANAGER - Controla ejecuciones programadas
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const STATE_PATH = join(DATA_DIR, 'schedule-state.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function loadScheduleState() {
  if (!existsSync(STATE_PATH)) {
    return { lastRunKey: null };
  }
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return { lastRunKey: null };
  }
}

export function saveScheduleState(state) {
  ensureDataDir();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}
