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

        strSQL = strSQL + " id_cuenta as codigo"; //opcion para busqueda
        strSQL = strSQL + " ,descripcion";
        strSQL = strSQL + " ,'' as auxiliar";
        
        strSQL = strSQL + " FROM";
        strSQL = strSQL + " mct_cuentacontable";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        if (id_maestro != undefined && id_maestro != null) {
        strSQL = strSQL + " AND id_cuenta like  '" + id_maestro + "%'";
        }

        strSQL = strSQL + " UNION ALL";
        
        strSQL = strSQL + " SELECT";
        strSQL = strSQL + " id_cuenta as codigo"; //opcion para busqueda
        strSQL = strSQL + " ,descripcion";
        strSQL = strSQL + " ,'' as auxiliar";
        strSQL = strSQL + " FROM";
        strSQL = strSQL + " mct_cuentacontable_det";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        strSQL = strSQL + " AND documento_id = '" + documento_id + "'";
        if (id_maestro != undefined && id_maestro != null) {
            strSQL = strSQL + " AND id_cuenta like  '" + id_maestro + "%'";
        }

        strSQL = strSQL + " ORDER BY codigo";
        
        //console.log(strSQL);
        const todasCuentas = await pool.query(strSQL);
        res.json(todasCuentas.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerTodosAmarres6 = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_usuario,id_cuenta} = req.params;

        /*strSQL = "select consulta2.*, mct_cuentacontable.descripcion as descripcion_haber ";
        strSQL += " ,(consulta2.descripcion_debe || '-' || mct_cuentacontable.descripcion)::varchar(300) as descripcion";
        strSQL += " from (";
        strSQL += " select consulta.*, mct_cuentacontable.descripcion as descripcion_debe from (";
        strSQL += " select id_cuenta,id_cuenta_haber ";
        strSQL += " from mct_cuentacontable ";
        strSQL += " where id_usuario = '" + id_usuario + "'";
        strSQL += " and id_cuenta_debe = '" + id_cuenta + "'";
        strSQL += " and not id_cuenta_debe is null";
        strSQL += " ) as consulta left join mct_cuentacontable";
        strSQL += " on ('" + id_usuario + "' = mct_cuentacontable.id_usuario and";
        strSQL += "    consulta.id_cuenta = mct_cuentacontable.id_cuenta)";
        strSQL += " ) as consulta2 left join mct_cuentacontable";
        strSQL +=" on ('" + id_usuario + "' = mct_cuentacontable.id_usuario and";
        strSQL +="     consulta2.id_cuenta_haber = mct_cuentacontable.id_cuenta)";*/

        strSQL = "SELECT consulta3.id_cuenta as codigo ";
        strSQL += " ,consulta3.descripcion_debe as descripcion";
        strSQL += " ,(consulta3.id_cuenta_haber || '-' || consulta3.descripcion_haber)::varchar(200) as auxiliar";
        strSQL += " FROM (";
        strSQL += " select consulta2.*, mct_cuentacontable.descripcion as descripcion_haber ";
        strSQL += " from (";
        strSQL += " select consulta.*, mct_cuentacontable.descripcion as descripcion_debe from (";
        strSQL += " select id_cuenta,id_cuenta_haber ";
        strSQL += " from mct_cuentacontable ";
        strSQL += " where id_usuario = '" + id_usuario + "'";
        strSQL += " and id_cuenta_debe = '" + id_cuenta + "'";
        strSQL += " and not id_cuenta_debe is null";
        strSQL += " ) as consulta left join mct_cuentacontable";
        strSQL += " on ('" + id_usuario + "' = mct_cuentacontable.id_usuario and";
        strSQL += "    consulta.id_cuenta = mct_cuentacontable.id_cuenta)";
        strSQL += " ) as consulta2 left join mct_cuentacontable";
        strSQL +=" on ('" + id_usuario + "' = mct_cuentacontable.id_usuario and";
        strSQL +="     consulta2.id_cuenta_haber = mct_cuentacontable.id_cuenta)";
        strSQL += " ) AS consulta3 ";

        const todasCuentas = await pool.query(strSQL);
        res.json(todasCuentas.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerTodosAmarres9 = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_usuario,id_cuenta} = req.params;

        strSQL = "select consulta2.*, mct_cuentacontable.descripcion as descripcion_haber";
        strSQL += " ,(consulta2.descripcion_debe || '-' || mct_cuentacontable.descripcion)::varchar(300) as descripcion from (";
        strSQL += " select consulta.*, mct_cuentacontable.descripcion as descripcion_debe from (";
        strSQL += " select id_cuenta_debe,id_cuenta_haber ";
        strSQL += " from mct_cuentacontable ";
        strSQL += " where id_usuario = '" + id_usuario + "'";
        strSQL += " and id_cuenta = '" + id_cuenta + "'";
        strSQL += " and not id_cuenta_debe is null";
        strSQL += " ) as consulta left join mct_cuentacontable";
        strSQL += " on ('" + id_usuario + "' = mct_cuentacontable.id_usuario and";
        strSQL += "    consulta.id_cuenta_debe = mct_cuentacontable.id_cuenta)";
        strSQL += " ) as consulta2 left join mct_cuentacontable";
        strSQL +=" on ('" + id_usuario + "' = mct_cuentacontable.id_usuario and";
        strSQL +="     consulta2.id_cuenta_haber = mct_cuentacontable.id_cuenta)";

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
    obtenerTodosAmarres6,
    obtenerTodosAmarres9,
    obtenerCuenta,
    crearCuenta,
    eliminarCuenta,
    actualizarCuenta
 }; 