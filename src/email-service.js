// ============================================================
// SERVICIO DE EMAIL - Envio via SMTP (Nodemailer)
// ============================================================

import nodemailer from 'nodemailer';

async function getGraphToken(tenantId, clientId, clientSecret) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error obteniendo token Graph (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.access_token;
}

async function sendGraphEmail(htmlContent, dateStr, config) {
  const { recipients } = config.emailConfig;
  const g = config.graphEmail || {};
  const { tenantId, clientId, clientSecret, fromUser, saveToSentItems } = g;

  if (!tenantId || !clientId || !clientSecret || !fromUser) {
    throw new Error('Credenciales Graph no configuradas. Revisa config.json (graphEmail).');
  }

  const token = await getGraphToken(tenantId, clientId, clientSecret);
  const subject = `Licitaciones Publicas REGENERA - ${dateStr}`;

  for (const recipient of recipients) {
    const payload = {
      message: {
        subject,
        body: {
          contentType: 'HTML',
          content: htmlContent
        },
        toRecipients: [
          { emailAddress: { address: recipient } }
        ]
      },
      saveToSentItems: !!saveToSentItems
    };

    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromUser)}/sendMail`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Error Graph enviando a ${recipient} (${res.status}): ${text}`);
    }
    console.log(`[EMAIL] Enviado correctamente (Graph) a: ${recipient}`);
  }

  console.log(`[EMAIL] Proceso de envio completado (Graph) (${recipients.length} destinatarios)`);
}

/**
 * Envia el resumen de licitaciones por email a todos los destinatarios
 */
export async function sendEmail(htmlContent, dateStr, config) {
  const { smtp, from, recipients } = config.emailConfig;
  const provider = (config.emailConfig.provider || 'Smtp').toLowerCase();

  if (provider === 'graph') {
    return await sendGraphEmail(htmlContent, dateStr, config);
  }

  if (!smtp.user || !smtp.password) {
    throw new Error('Credenciales SMTP no configuradas. Ejecuta "configurar.bat" primero.');
  }

  if (!recipients || recipients.length === 0) {
    throw new Error('No hay destinatarios configurados. Ejecuta "configurar.bat" primero.');
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.password,
    },
  });

  // Verificar conexion
  try {
    await transporter.verify();
    console.log('[EMAIL] Conexion SMTP verificada correctamente');
  } catch (error) {
    throw new Error(`Error de conexion SMTP: ${error.message}. Revisa host, puerto, usuario y contrasena.`);
  }

  const subject = `Licitaciones Publicas REGENERA - ${dateStr}`;

  // Enviar a cada destinatario
  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from: from || smtp.user,
        to: recipient,
        subject: subject,
        html: htmlContent,
      });
      console.log(`[EMAIL] Enviado correctamente a: ${recipient}`);
    } catch (error) {
      console.error(`[EMAIL] Error enviando a ${recipient}: ${error.message}`);
    }
  }

  console.log(`[EMAIL] Proceso de envio completado (${recipients.length} destinatarios)`);
}
