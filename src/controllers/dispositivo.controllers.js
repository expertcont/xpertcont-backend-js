const crypto = require('crypto');
const pool = require('../db');

// Reto (nonce) de un solo uso por verificacion. Vive en memoria: si el backend
// se reinicia o corre varias instancias, el cliente solo tiene que reintentar.
const NONCE_TTL_MS = 120000;
const noncePendientes = new Map();

const limpiarNoncesVencidos = () => {
    const ahora = Date.now();
    for (const [clave, item] of noncePendientes) {
        if (item.expira < ahora) noncePendientes.delete(clave);
    }
};

const crearNonce = (idUsuario, huella) => {
    limpiarNoncesVencidos();
    const nonce = crypto.randomBytes(24).toString('base64url');
    const clave = `${idUsuario}|${huella}|${nonce}`;
    noncePendientes.set(clave, { expira: Date.now() + NONCE_TTL_MS });
    return nonce;
};

const consumirNonce = (idUsuario, huella, nonce) => {
    const clave = `${idUsuario}|${huella}|${nonce}`;
    const item = noncePendientes.get(clave);
    if (!item) return false;
    noncePendientes.delete(clave);
    return item.expira >= Date.now();
};

const base64urlABuf = (valor) => Buffer.from(String(valor || ''), 'base64url');

// El navegador firma con WebCrypto, que devuelve la firma en formato crudo
// (r||s, IEEE P1363). Por eso se indica dsaEncoding para que Node compare igual.
const verificarFirma = ({ llavePublica, nonce, firma }) => {
    try {
        if (!llavePublica || !nonce || !firma) return false;
        const clave = crypto.createPublicKey({
            key: base64urlABuf(llavePublica),
            format: 'der',
            type: 'spki',
        });
        return crypto.verify(
            'sha256',
            Buffer.from(String(nonce), 'utf8'),
            { key: clave, dsaEncoding: 'ieee-p1363' },
            base64urlABuf(firma),
        );
    } catch (error) {
        console.log('firma de dispositivo invalida:', error.message);
        return false;
    }
};

const consultarEquipo = async (req, res) => {
    try {
        const idUsuario = String(req.body?.id_usuario || '').trim().toLowerCase();
        const huella = String(req.body?.huella || '').trim().toLowerCase();

        if (!idUsuario || !huella) {
            return res.status(400).json({ success: false, message: 'Falta id_usuario o huella.' });
        }

        const strSQL = "SELECT etiqueta, equipo_activo, creado_en, ultimo_uso";
        strSQL = strSQL + " FROM mad_seguridad_dispositivo";
        strSQL = strSQL + " WHERE lower(id_usuario) = $1 AND huella = $2";
        const resultado = await pool.query(strSQL, [idUsuario, huella]);

        if (resultado.rows.length === 0) {
            return res.json({ success: true, autorizado: false, motivo: 'Equipo no registrado' });
        }

        const equipo = resultado.rows[0];
        if (equipo.equipo_activo === false) {
            return res.json({ success: true, autorizado: false, motivo: 'Equipo revocado por el administrador' });
        }

        res.json({ success: true, autorizado: true, etiqueta: equipo.etiqueta || '' });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const verificarEquipo = async (req, res) => {
    try {
        const idUsuario = String(req.body?.id_usuario || '').trim().toLowerCase();
        const huella = String(req.body?.huella || '').trim().toLowerCase();
        const { nonce, firma } = req.body || {};

        if (!idUsuario || !huella || !nonce || !firma) {
            return res.status(400).json({ success: false, message: 'Falta id_usuario, huella, nonce o firma.' });
        }

        // El reto se consume aunque la firma falle, para no permitir reintentos.
        const retoValido = consumirNonce(idUsuario, huella, String(nonce));
        if (!retoValido) {
            return res.status(401).json({ success: false, autorizado: false, message: 'Reto vencido o invalido.' });
        }

        const strSQL = "SELECT etiqueta, llave_publica, equipo_activo";
        strSQL = strSQL + " FROM mad_seguridad_dispositivo";
        strSQL = strSQL + " WHERE lower(id_usuario) = $1 AND huella = $2";
        const resultado = await pool.query(strSQL, [idUsuario, huella]);

        if (resultado.rows.length === 0) {
            return res.status(403).json({ success: false, autorizado: false, message: 'Equipo no registrado.' });
        }

        const equipo = resultado.rows[0];
        if (equipo.equipo_activo === false) {
            return res.status(403).json({ success: false, autorizado: false, message: 'Equipo revocado por el administrador.' });
        }

        const firmaValida = verificarFirma({
            llavePublica: equipo.llave_publica,
            nonce: String(nonce),
            firma: String(firma),
        });

        if (!firmaValida) {
            return res.status(401).json({ success: false, autorizado: false, message: 'La firma del equipo no es valida.' });
        }

        const strUpd = "UPDATE mad_seguridad_dispositivo SET ultimo_uso = now()";
        strUpd = strUpd + " WHERE lower(id_usuario) = $1 AND huella = $2";
        await pool.query(strUpd, [idUsuario, huella]);

        res.json({ success: true, autorizado: true, etiqueta: equipo.etiqueta || '' });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const obtenerReto = async (req, res) => {
    try {
        const idUsuario = String(req.body?.id_usuario || '').trim().toLowerCase();
        const huella = String(req.body?.huella || '').trim().toLowerCase();

        if (!idUsuario || !huella) {
            return res.status(400).json({ success: false, message: 'Falta id_usuario o huella.' });
        }

        res.json({ success: true, nonce: crearNonce(idUsuario, huella) });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const registrarEquipo = async (req, res) => {
    try {
        const idUsuario = String(req.body?.id_usuario || '').trim().toLowerCase();
        const huella = String(req.body?.huella || '').trim().toLowerCase();
        const etiqueta = String(req.body?.etiqueta || 'Equipo autorizado').slice(0, 120);
        const plataforma = String(req.body?.plataforma || '').slice(0, 80);
        const navegador = String(req.body?.navegador || '').slice(0, 180);
        const llavePublica = String(req.body?.llave_publica || '');

        if (!idUsuario || !huella || !llavePublica) {
            return res.status(400).json({ success: false, message: 'Falta id_usuario, huella o llave_publica.' });
        }

        const strSQL = "INSERT INTO mad_seguridad_dispositivo (id_usuario, huella, etiqueta, plataforma, navegador, llave_publica)";
        strSQL = strSQL + " VALUES ($1, $2, $3, $4, $5, $6)";
        strSQL = strSQL + " ON CONFLICT (id_usuario, huella) DO UPDATE SET etiqueta = EXCLUDED.etiqueta,";
        strSQL = strSQL + " llave_publica = EXCLUDED.llave_publica, equipo_activo = true";
        await pool.query(strSQL, [idUsuario, huella, etiqueta, plataforma, navegador, llavePublica]);

        res.json({ success: true, message: 'Equipo registrado.' });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const listarEquipos = async (req, res) => {
    try {
        const idUsuario = String(req.params.id_usuario || '').trim().toLowerCase();
        const strSQL = "SELECT huella, etiqueta, plataforma, navegador, equipo_activo, creado_en, ultimo_uso";
        strSQL = strSQL + " FROM mad_seguridad_dispositivo WHERE lower(id_usuario) = $1 ORDER BY creado_en";
        const resultado = await pool.query(strSQL, [idUsuario]);
        res.json(resultado.rows);
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const eliminarEquipo = async (req, res) => {
    try {
        const idUsuario = String(req.params.id_usuario || '').trim().toLowerCase();
        const huella = String(req.params.huella || '').trim().toLowerCase();
        const strSQL = "DELETE FROM mad_seguridad_dispositivo WHERE lower(id_usuario) = $1 AND huella = $2";
        const resultado = await pool.query(strSQL, [idUsuario, huella]);
        res.json({ success: true, message: `Equipos eliminados: ${resultado.rowCount}` });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    consultarEquipo,
    obtenerReto,
    verificarEquipo,
    registrarEquipo,
    listarEquipos,
    eliminarEquipo,
};
