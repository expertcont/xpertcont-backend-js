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
        const todosReg = await pool.query("SELECT cod,nombre FROM mct_tcomprobante ORDER BY cod");
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosMedioPago = async (req,res,next)=> {
    try {
        const todosReg = await pool.query("SELECT id_mediopago,nombre from mct_tmediopago ORDER BY id_mediopago");
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
    obtenerTodosMedioPago
 }; 