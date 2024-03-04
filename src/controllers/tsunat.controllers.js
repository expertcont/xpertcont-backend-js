const pool = require('../db');

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
        strSQL = "SELECT ccosto as codigo";
        strSQL += "     ,('C'|| ccosto)::varchar(100) as descripcion";
        strSQL += "     ,'' as auxiliar";
        strSQL += " FROM mct_asientocontabledet";
        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " GROUP BY ccosto";
        strSQL += " ORDER BY ccosto";
        const result = await pool.query(strSQL,[id_anfitrion,documento_id]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Usuario no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
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
    obtenerTodosCCostoPopUp
 }; 