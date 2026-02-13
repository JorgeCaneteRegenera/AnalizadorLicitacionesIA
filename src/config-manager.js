// ============================================================
// GESTOR DE CONFIGURACION - Lee/escribe config.json
// ============================================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');

const DEFAULT_CONFIG = {
  geminiApiKey: '',
  emailConfig: {
    provider: 'Smtp',
    smtp: {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: '',
      password: ''
    },
    from: '',
    recipients: []
  },
  graphEmail: {
    tenantId: '',
    clientId: '',
    clientSecret: '',
    fromUser: '',
    saveToSentItems: true
  },
  schedule: {
    enabled: true,
    periodicity: 'daily', // daily | weekdays | weekly
    hours: ['08:00'],
    daysOfWeek: [1, 2, 3, 4, 5] // 0=Dom, 1=Lun, ... 6=Sab (solo para weekly)
  },
  filters: {
    windowDays: 10,
    minBudgetLocal: 30000,
    minBudgetNational: 1000000
  }
};

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const schedule = { ...DEFAULT_CONFIG.schedule, ...(parsed.schedule || {}) };
    if (!parsed.schedule?.hours && typeof parsed.schedule?.hour === 'number') {
      const hh = String(parsed.schedule.hour).padStart(2, '0');
      const mm = String(parsed.schedule.minute || 0).padStart(2, '0');
      schedule.hours = [`${hh}:${mm}`];
    }
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      emailConfig: {
        ...DEFAULT_CONFIG.emailConfig,
        ...(parsed.emailConfig || {}),
        smtp: {
          ...DEFAULT_CONFIG.emailConfig.smtp,
          ...((parsed.emailConfig && parsed.emailConfig.smtp) || {})
        }
      },
      graphEmail: { ...DEFAULT_CONFIG.graphEmail, ...(parsed.graphEmail || {}) },
      schedule,
      filters: { ...DEFAULT_CONFIG.filters, ...(parsed.filters || {}) }
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function isConfigured(config) {
  if (!config.geminiApiKey || config.emailConfig.recipients.length === 0) return false;
  const provider = (config.emailConfig.provider || 'Smtp').toLowerCase();
  if (provider === 'graph') {
    const g = config.graphEmail || {};
    return !!(g.tenantId && g.clientId && g.clientSecret && g.fromUser);
  }
  return !!(config.emailConfig.smtp.user && config.emailConfig.smtp.password);
}
