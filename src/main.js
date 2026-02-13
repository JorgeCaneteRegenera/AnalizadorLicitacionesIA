// ============================================================
// MAIN - Script principal de ejecucion automatizada
// Analizador de Licitaciones Publicas - REGENERA
// ============================================================

import { runAnalysis } from './run-service.js';

const isTestMode = process.argv.includes('--test');

async function run() {
  try {
    const result = await runAnalysis({
      testMode: isTestMode,
      onLog: (msg) => console.log(msg),
      onStep: ({ step, total, label }) => console.log(`[PASO ${step}/${total}] ${label}...`),
      onProgress: ({ current, total }) => process.stdout.write(`  [${current}/${total}] `),
      onTender: () => process.stdout.write(''),
    });

    console.log('');
    console.log('========================================');
    console.log(`  Proceso completado en ${result.elapsed} segundos`);
    console.log(`  Licitaciones enviadas: ${result.tenders.length}`);
    console.log('========================================');
  } catch (error) {
    console.error('');
    console.error('[ERROR CRITICO]', error.message);
    console.error('');
    console.error('Posibles causas:');
    console.error('  - Sin conexion a internet');
    console.error('  - API key de Gemini invalida o sin saldo');
    console.error('  - Credenciales SMTP incorrectas');
    console.error('  - La web de PLACSP no esta disponible');
    process.exit(1);
  }
}

run();
