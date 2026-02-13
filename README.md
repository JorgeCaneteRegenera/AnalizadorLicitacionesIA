# AnalizadorLicitacionesIA

Azure Functions (Timer Trigger) para analizar licitaciones y enviar resumen por email.

## Estructura
- `src/` codigo del analizador y servicios
- `src/functions/AnalizadorLicitaciones.js` function timer
- `config.json.example` plantilla de configuracion (no subir secrets)

## Ejecucion local
1. Copia `config.json.example` a `config.json` y completa credenciales.
2. `npm install`
3. `func start`
