const { spawn } = require('node:child_process');
const { registrar } = require('./diagnosticoSunat');

// No ejecuta procesos al importar el modulo ni cambia process.env.DISPLAY.
// Cada login recibe su pantalla; Xvfb elige un numero libre mediante -displayfd.
const prepararPantalla = async ({ contexto, timeoutMs = 10000 }) => {
  const headless = process.env.PLAYWRIGHT_HEADLESS === '1';
  const env = { ...process.env };
  if (headless || process.platform !== 'linux' || env.DISPLAY) {
    registrar(contexto, 'portal', 'pantalla_configurada', {
      headless, pantalla: headless ? 'sin_interfaz' : env.DISPLAY ? 'existente' : 'sistema',
    });
    return { headless, env, cerrar: async () => {} };
  }

  registrar(contexto, 'portal', 'xvfb_iniciando', { timeoutMs });
  let hijo;
  let salidaError = '';
  let cerrado;
  const cerrar = () => {
    if (cerrado) return cerrado;
    cerrado = new Promise(resolve => {
      if (!hijo?.pid || hijo.exitCode !== null || hijo.signalCode !== null) return resolve();
      const terminar = () => { clearTimeout(limite); resolve(); };
      const limite = setTimeout(() => {
        hijo.removeListener('exit', terminar);
        hijo.kill('SIGKILL');
        resolve();
      }, 2000);
      hijo.once('exit', terminar);
      hijo.kill('SIGTERM');
    });
    return cerrado;
  };

  try {
    hijo = spawn('Xvfb', ['-displayfd', '3', '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], {
      env, stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
    });
    hijo.stderr.on('data', datos => {
      salidaError = (salidaError + datos.toString()).slice(-2000);
    });
    const display = await new Promise((resolve, reject) => {
      let resuelto = false;
      let recibido = '';
      const completar = (error, numero) => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(limite);
        if (error) reject(error); else resolve(numero);
      };
      const limite = setTimeout(() => completar(new Error(`Xvfb no confirmo una pantalla en ${timeoutMs} ms.`)), timeoutMs);
      hijo.on('error', error => completar(new Error(`No se pudo ejecutar Xvfb (${error.code || 'error de proceso'}).`)));
      hijo.once('exit', (codigo, senal) => {
        const mensaje = `Xvfb termino (codigo ${codigo}, senal ${senal || 'ninguna'}).`;
        if (!resuelto) completar(new Error(mensaje));
        else registrar(contexto, 'portal', 'xvfb_detenido', { codigo, senal });
      });
      hijo.stdio[3].on('error', () => completar(new Error('No se pudo leer la pantalla de Xvfb.')));
      hijo.stdio[3].on('data', datos => {
        recibido += datos.toString();
        if (recibido.includes('\n')) {
          const numero = recibido.trim();
          if (/^\d{1,5}$/.test(numero)) completar(null, `:${numero}`);
          else completar(new Error('Xvfb devolvio un numero de pantalla invalido.'));
        }
      });
    });
    registrar(contexto, 'portal', 'xvfb_listo', { display });
    return { headless: false, env: { ...env, DISPLAY: display }, cerrar };
  } catch (error) {
    await cerrar();
    const detalle = salidaError.replace(/\s+/g, ' ').trim().slice(0, 500);
    registrar(contexto, 'portal', 'xvfb_fallo', { mensajeSunat: error.message, detalle });
    throw Object.assign(new Error(`${error.message}${detalle ? ' ' + detalle : ''}`), { statusCode: 501 });
  }
};

module.exports = { prepararPantalla };
