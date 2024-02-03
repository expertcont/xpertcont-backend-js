const pool = require('../db');

const obtenerTodasCuentas = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_usuario,documento_id} = req.params;
        strSQL = "SELECT ";
        strSQL = strSQL + " id_cuenta";
        strSQL = strSQL + " ,descripcion";
        strSQL = strSQL + " ,tiene_correntista";
        strSQL = strSQL + " ,me";
        strSQL = strSQL + " ,imputable";
        strSQL = strSQL + " ,cuenta_gestion";
        strSQL = strSQL + " ,cuenta_balance";
        strSQL = strSQL + " ,cuenta_funcion";
        strSQL = strSQL + " ,cuenta_naturaleza";
        strSQL = strSQL + " FROM";
        strSQL = strSQL + " mct_cuentacontable";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        
        strSQL = strSQL + " UNION ALL";
        
        strSQL = strSQL + " SELECT id_cuenta";
        strSQL = strSQL + " ,descripcion";
        strSQL = strSQL + " ,tiene_correntista";
        strSQL = strSQL + " ,me";
        strSQL = strSQL + " ,imputable";
        strSQL = strSQL + " ,cuenta_gestion";
        strSQL = strSQL + " ,cuenta_balance";
        strSQL = strSQL + " ,cuenta_funcion";
        strSQL = strSQL + " ,cuenta_naturaleza";
        strSQL = strSQL + " FROM";
        strSQL = strSQL + " mct_cuentacontable_det";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        strSQL = strSQL + " AND documento_id = '" + documento_id + "'";

        strSQL = strSQL + " ORDER BY id_cuenta";

        const todasCuentas = await pool.query(strSQL);
        res.json(todasCuentas.rows);
    }
    catch(error){
        console.log(error.message);
    }
    //res.send('Listado de todas los zonas');
};

const obtenerTodasCuentasSimple = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_usuario,documento_id,id_maestro} = req.params;
        strSQL = "SELECT ";
        strSQL = strSQL + " id_cuenta";
        strSQL = strSQL + " ,descripcion";
        strSQL = strSQL + " FROM";
        strSQL = strSQL + " mct_cuentacontable";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        if (id_maestro != undefined && id_maestro != null) {
        strSQL = strSQL + " AND id_cuenta like  '" + id_maestro + "%'";
        }
        strSQL = strSQL + " UNION ALL";
        
        strSQL = strSQL + " SELECT id_cuenta";
        strSQL = strSQL + " ,descripcion";
        strSQL = strSQL + " FROM";
        strSQL = strSQL + " mct_cuentacontable_det";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        strSQL = strSQL + " AND documento_id = '" + documento_id + "'";
        if (id_maestro != undefined && id_maestro != null) {
            strSQL = strSQL + " AND id_cuenta like  '" + id_maestro + "%'";
        }

        strSQL = strSQL + " ORDER BY id_cuenta";

        const todasCuentas = await pool.query(strSQL);
        res.json(todasCuentas.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerCuenta = async (req,res,next)=> {
    try {
        const {id_usuario,documento_id} = req.params;
        const result = await pool.query("select * from mad_usuariocontabilidad where id_usuario = $1 and documento_id = $2",[id_usuario, documento_id]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Contabilidad no encontrada"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearCuenta = async (req,res,next)=> {
    const { id_usuario,     //correo anfitrion
            documento_id,   //contabilidad
            razon_social   //contabilidad
            } = req.body
    try {
        let strSQL;
        strSQL = "INSERT INTO mad_usuariocontabilidad";
        strSQL = strSQL + " (";
        strSQL = strSQL + " id_usuario,documento_id,razon_social,activo";
        strSQL = strSQL + " )";
        strSQL = strSQL + " VALUES ($1,$2,$3,'1')"; 
        strSQL = strSQL + " RETURNING *";
        const result = await pool.query(strSQL, 
        [   
            id_usuario,
            documento_id,
            razon_social
        ]
        );
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const eliminarCuenta = async (req,res,next)=> {
    try {
        const {id_usuario, documento_id} = req.params;
        const result = await pool.query("delete from mad_usuariocontabilidad where id_usuario = $1 and documento_id = $2",[id_usuario,documento_id]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Contabilidad no encontrada"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

const actualizarCuenta = async (req,res,next)=> {
    try {
        const {id_usuario, documento_id} = req.params;
        const {razon_social,activo} = req.body
 
        const result = await pool.query("update mad_usuariocontabilidad set razon_social=$1,activo=$2 where id_usuario=$3 and documento_id=$4",[razon_social,activo,id_usuario,documento_id]);

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
    obtenerTodasCuentas,
    obtenerTodasCuentasSimple,
    obtenerCuenta,
    crearCuenta,
    eliminarCuenta,
    actualizarCuenta
 }; 