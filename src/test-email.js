// ============================================================
// TEST EMAIL - Envio rapido para validar configuracion
// ============================================================

import { loadConfig, isConfigured } from './config-manager.js';
import { sendEmail } from './email-service.js';

async function run() {
  const config = loadConfig();
  if (!isConfigured(config)) {
    console.error('[ERROR] La aplicacion no esta configurada.');
    console.error('Ejecuta "configurar.bat" para configurar API keys, email y destinatarios.');
    process.exit(1);
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.4;">
      <h2 style="color:#1e40af;">TEST EMAIL - REGENERA</h2>
      <p>Este es un correo de prueba del analizador de licitaciones.</p>
      <p>Fecha: ${dateStr}</p>
    </div>
  `;

  try {
    await sendEmail(html, dateStr, config);
    console.log('[TEST] Email de prueba enviado correctamente.');
  } catch (err) {
    console.error('[TEST] Error enviando email de prueba:', err.message);
    process.exit(1);
  }
}

run();
