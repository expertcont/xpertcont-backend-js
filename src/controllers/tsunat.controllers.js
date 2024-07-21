const pool = require('../db');
require('dotenv').config();
const fetch = require('node-fetch');

const obtenerTodosPais = async (req,res,next)=> {
    try {
        const todosReg = await pool.query("SELECT id_pais,nombre FROM mct_tpais ORDER BY id_pais");
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosBss = async (req,res,next)=> {
    try {
        const todosReg = await pool.query("SELECT idbss,nombre FROM mct_tbss ORDER BY idbss");
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosAduana = async (req,res,next)=> {
    try {
        const todosReg = await pool.query("SELECT id_aduana,nombre FROM mct_taduana ORDER BY id_aduana");
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosComprobante = async (req,res,next)=> {
    try {
        const {tipo} = req.params; //tipo = c(compras) v(ventas) o t(todos)
        let strSQL;
        strSQL = "SELECT cod,nombre FROM mct_tcomprobante";
        if (tipo ==='c') {
            strSQL += " WHERE c_compras = '1'";
        }
        if (tipo ==='v') {
            strSQL += " WHERE c_ventas = '1'";
        }
        strSQL += " ORDER BY cod";
        console.log(strSQL);
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosMedioPago = async (req,res,next)=> {
    try {
        const todosReg = await pool.query("SELECT id_mediopago as codigo, nombre as descripcion from mct_tmediopago ORDER BY id_mediopago");
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosIdDoc = async (req,res,next)=> {
    try {
        const todosReg = await pool.query("SELECT id_doc as codigo, nombre as descripcion from mct_tdoc ORDER BY id_doc");
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosCCostoPopUp = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id} = req.params;
        strSQL = "SELECT r_ccosto as codigo";
        strSQL += "     ,('C'|| r_ccosto)::varchar(100) as descripcion";
        strSQL += "     ,''::varchar(10) as auxiliar";
        strSQL += " FROM mct_asientocontabledet";
        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " AND not r_ccosto is null";
        strSQL += " GROUP BY r_ccosto";
        strSQL += " ORDER BY r_ccosto";
        const todosReg = await pool.query(strSQL,[id_anfitrion,documento_id]);
        res.json(todosReg.rows);

    } catch (error) {
        console.log(error.message);
    }
};

const obtenerTodosLibros = async (req,res,next)=> {
    try {
        let strSQL;
        strSQL = "SELECT id_libro as codigo,nombre as descripcion FROM mct_librocontable";
        strSQL += " UNION ALL ";
        strSQL += " SELECT 'todos' as codigo, 'TODOS' as descripcion ";
        strSQL += " ORDER BY codigo";

        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerTCSunat = async (req, res, next) => {
    try {
        const { fecha, tipo } = req.params;
        const strSQL = "SELECT fct_extrae_tc($1, $2) AS tc";
        
        // Pasamos los parámetros a la consulta
        const todosReg = await pool.query(strSQL, [fecha, tipo]);
        //console.log([fecha, tipo]);
        // Verificamos si hay resultados y enviamos el resultado
        if (todosReg.rows.length > 0) {
            res.json(todosReg.rows[0]);  // Devuelve el primer (y único) resultado
        } else {
            res.status(404).json({ message: "No data found" });  // En caso de no encontrar resultados
        }
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ message: "Server error" });
    }
};

const generarTCSunat = async (req, res, next) => {
    const apiToken = process.env.APIPERU_TOKEN;
    const { fecha } = req.body;
    console.log('fecha: ',fecha);
    try {
        const response = await fetch('https://apiperu.dev/api/tipo_de_cambio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiToken}`
            },
            body: JSON.stringify({ fecha })  // Enviar ref_documento_id en el cuerpo de la solicitud
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error('Error en la solicitud a la API de terceros');
        }
        res.json(data);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    obtenerTodosPais,
    obtenerTodosBss,
    obtenerTodosAduana,
    obtenerTodosComprobante,
    obtenerTodosMedioPago,
    obtenerTodosIdDoc,
    obtenerTodosCCostoPopUp,
    obtenerTodosLibros,
    obtenerTCSunat,
    generarTCSunat
 }; 