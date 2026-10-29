// Ejecutar dentro del contenedor para probar Xvfb/Chromium sin claves ni acceso a SUNAT.
const { prepararPantalla } = require('../src/services/cpe/pantallaVirtual.service');

async function comprobar() {
  let pantalla;
  let navegador;
  try {
    console.log('[Prueba navegador] Iniciando pantalla y Chromium; sin login SUNAT.');
    pantalla = await prepararPantalla({ contexto: { prueba: 'navegador' } });
    const { chromium } = require('playwright');
    navegador = await chromium.launch({ headless: pantalla.headless, env: pantalla.env,
      timeout: 30000, args: ['--no-sandbox'] });
    const pagina = await navegador.newPage();
    await pagina.goto('about:blank', { timeout: 5000 });
    console.log('[Prueba navegador] OK: Chromium abrio una pagina vacia.');
  } finally {
    try {
      if (navegador) await navegador.close();
    } finally {
      if (pantalla) await pantalla.cerrar();
    }
  }
}

comprobar().catch(error => {
  console.error('[Prueba navegador] FALLO:', error.message);
  process.exitCode = 1;
});
