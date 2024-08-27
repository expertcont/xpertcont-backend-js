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

/*const generarTCSunat = async (req, res, next) => {
    const apiToken = process.env.APIPERU_TOKEN;
    const { fecha } = req.body;
    console.log('fecha: ',fecha);
    try {
        //Consultar si existe en BD Interna
        let strSQL;
        strSQL = "select * from fct_extrae_tc2($1)";
        strSQL += " as (";
	    strSQL += "  compra numeric(5,3)";
        strSQL += " ,venta numeric(5,3)";
        strSQL += " )";
        
        // Pasamos los parámetros a la consulta
        const todosReg = await pool.query(strSQL, [fecha]);
        // Verificamos si hay resultados
        if (todosReg.rows.length > 0) {
            //res.json(todosReg.rows[0]);  
            // json simple {compra, venta} Convertir los valores a numéricos
            const resultado = {
                compra: parseFloat(todosReg.rows[0].compra),
                venta: parseFloat(todosReg.rows[0].venta)
            };
            res.json(resultado);
        } else {
            //En caso de no encontrar resultados

            //consumir API tercero
            const response = await fetch('https://apiperu.dev/api/tipo_de_cambio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiToken}`
                },
                body: JSON.stringify({ fecha })  // Enviar ref_documento_id en el cuerpo de la solicitud
            });
            const resultado = await response.json();
            
            //Intentar insertar el dato en la base de datos
            if (resultado.success) {
                try {
                    const insertQuery = 'INSERT INTO mct_tc (fecha, compra_of, venta_of) VALUES ($1, $2, $3) RETURNING *';
                    const values = [fecha, resultado.data.compra, resultado.data.venta]; // Ajusta los campos según la respuesta de la API y tu tabla
                    const insertResult = await pool.query(insertQuery, values);
                    console.log('Dato insertado:', insertResult.rows[0]);
                } catch (dbError) {
                    if (dbError.code === '23505') { // Código de error para duplicados en PostgreSQL
                        console.log('El dato ya existe en la base de datos, finalizamos simplemente');
                    } 
                } 
                //res.json(resultado);
                //aqui reducimos el json del tercero a json simple {compra,venta}
                // Extraer los campos "venta" y "compra"
                // Convertir los valores a numéricos si es necesario
                const venta = parseFloat(resultado.data.venta);
                const compra = parseFloat(resultado.data.compra);
                const resultadoReducido = {
                    compra: compra,
                    venta: venta
                };
                res.json(resultadoReducido);
            }
            else{
                res.json({compra:0,venta:0});
            }
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};*/

const TCSunatFetchFromAPI = async (fecha, apiToken) => {
    const response = await fetch('https://apiperu.dev/api/tipo_de_cambio', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiToken}`
        },
        body: JSON.stringify({ fecha })
    });
    return response.json();
};
const TCSunatInsertIntoDatabase = async (fecha, compra, venta) => {
    try {
        const insertQuery = `
            INSERT INTO mct_tc (fecha, compra_of, venta_of)
            VALUES ($1, $2, $3) RETURNING *
        `;
        const values = [fecha, compra, venta];
        const insertResult = await pool.query(insertQuery, values);
        console.log('Dato insertado:', insertResult.rows[0]);
    } catch (dbError) {
        if (dbError.code === '23505') { // Código de error para duplicados en PostgreSQL
            console.log('El dato ya existe en la base de datos, finalizamos simplemente');
        } else {
            throw dbError;
        }
    }
};
const TCSunatFetchFromDatabase = async (fecha) => {
    const strSQL = `
        SELECT * FROM fct_extrae_tc2($1)
        AS (
            compra numeric(5,3),
            venta numeric(5,3)
        )
    `;
    const { rows } = await pool.query(strSQL, [fecha]);
    return rows;
};

const generarTCSunat = async (req, res, next) => {
    const apiToken = process.env.APIPERU_TOKEN;
    const { fecha } = req.body;
    console.log('Fecha: ', fecha);

    try {
        const rows = await TCSunatFetchFromDatabase(fecha);

        if (rows.length > 0) {
            const resultado = {
                compra: parseFloat(rows[0].compra),
                venta: parseFloat(rows[0].venta)
            };
            return res.json(resultado); // Aquí se detiene la ejecución si se cumple esta condición
        } 

        const resultado = await TCSunatFetchFromAPI(fecha, apiToken);

        if (resultado.success) {
            const { compra, venta } = resultado.data;
            await TCSunatInsertIntoDatabase(fecha, compra, venta);

            const resultadoReducido = {
                compra: parseFloat(compra),
                venta: parseFloat(venta)
            };
            return res.json(resultadoReducido); // Aquí se detiene la ejecución si se cumple esta condición
        }

        return res.json({ compra: 0, venta: 0 }); // Aquí se detiene la ejecución si `resultado.success` es falso
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message }); // Aquí se detiene la ejecución si ocurre un error
    }
};

const obtenerTodosUnidadesMedida = async (req,res,next)=> {
    try {
        let strSQL;
        strSQL = "SELECT id_unidad as codigo, nombre as descripcion FROM mct_unidad";
        strSQL += " ORDER BY codigo";

        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
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
    generarTCSunat,
    obtenerTodosUnidadesMedida
 }; 