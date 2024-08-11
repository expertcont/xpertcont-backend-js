const pool = require('../db');

const obtenerTodasContabilidades = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion} = req.params;
        strSQL = "SELECT ";
        strSQL += " mad_usuariocontabilidad.documento_id,";
        strSQL += " mad_usuariocontabilidad.razon_social,";
        strSQL += " mad_usuariocontabilidad.tipo,"; //new
        strSQL += " mad_usuariocontabilidad.activo,";
        strSQL += " count(mct_cuentacontable_det.id_cuenta)::numeric(10) as cuentas";
        strSQL += " FROM";
        strSQL += " mad_usuariocontabilidad LEFT JOIN mct_cuentacontable_det";
        strSQL += " ON (mad_usuariocontabilidad.id_usuario = mct_cuentacontable_det.id_usuario and";
        strSQL += "     mad_usuariocontabilidad.documento_id = mct_cuentacontable_det.documento_id)";
        strSQL += " WHERE mad_usuariocontabilidad.id_usuario = '" + id_anfitrion + "'";
        strSQL += " GROUP BY ";
        strSQL += " mad_usuariocontabilidad.documento_id,";
        strSQL += " mad_usuariocontabilidad.razon_social,";
        strSQL += " mad_usuariocontabilidad.tipo,";
        strSQL += " mad_usuariocontabilidad.activo";
        strSQL += " ORDER BY mad_usuariocontabilidad.razon_social";

        const todasZonas = await pool.query(strSQL);
        res.json(todasZonas.rows);
    }
    catch(error){
        console.log(error.message);
    }
    //res.send('Listado de todas los zonas');
};
const obtenerContabilidad = async (req,res,next)=> {
    try {
        const {id_anfitrion,documento_id,tipo} = req.params;
        const result = await pool.query("select * from mad_usuariocontabilidad where id_usuario = $1 and documento_id = $2 and tipo =$3",[id_anfitrion, documento_id, tipo]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Contabilidad no encontrada"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearContabilidad = async (req,res,next)=> {
    const { id_anfitrion,     //correo anfitrion
            documento_id,   //contabilidad
            tipo,           //new
            razon_social   //contabilidad
            } = req.body
    try {
        let strSQL;
        strSQL = "INSERT INTO mad_usuariocontabilidad";
        strSQL = strSQL + " (";
        strSQL = strSQL + " id_usuario,documento_id,tipo,razon_social,activo";
        strSQL = strSQL + " )";
        strSQL = strSQL + " VALUES ($1,$2,$3,$4,'1')"; 
        strSQL = strSQL + " RETURNING *";
        const result = await pool.query(strSQL, 
        [   
            id_anfitrion,
            documento_id,
            tipo,
            razon_social
        ]
        );
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const eliminarContabilidad = async (req,res,next)=> {
    try {
        const {id_anfitrion, documento_id, tipo} = req.params;
        const result = await pool.query("delete from mad_usuariocontabilidad where id_usuario = $1 and documento_id = $2 and tipo =$3",[id_anfitrion,documento_id,tipo]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Contabilidad no encontrada"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};
const actualizarContabilidad = async (req,res,next)=> {
    try {
        const {id_anfitrion, documento_id, tipo} = req.params;
        const {razon_social,activo} = req.body
 
        const result = await pool.query("update mad_usuariocontabilidad set razon_social=$1,activo=$2 where id_usuario=$3 and documento_id=$4 and tipo=$5",[razon_social,activo,id_anfitrion,documento_id,tipo]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Contabilidad no encontrada"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

module.exports = {
    obtenerTodasContabilidades,
    obtenerContabilidad,
    crearContabilidad,
    eliminarContabilidad,
    actualizarContabilidad
 }; 