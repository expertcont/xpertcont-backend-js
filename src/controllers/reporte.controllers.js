const pool = require('../db');

const obtenerHojaTrabajo = async (req,res,next)=> {
    let strSQL;
    const {id_anfitrion,documento_id,periodo_ini,periodo_fin,id_libro,nivel} = req.params;

    strSQL = "select ht.*,";
    strSQL += "  CASE WHEN ht.saldo > 0 AND ht.cuenta_balance = '1' THEN ht.saldo ELSE NULL END AS balance_debe,";
    strSQL += "  CASE WHEN ht.saldo < 0 AND ht.cuenta_balance = '1' THEN -ht.saldo ELSE NULL END AS balance_haber,";
    strSQL += "  CASE WHEN ht.saldo > 0 AND ht.cuenta_gestion = '1' THEN ht.saldo ELSE NULL END AS gestion_debe,";
    strSQL += "  CASE WHEN ht.saldo < 0 AND ht.cuenta_gestion = '1' THEN -ht.saldo ELSE NULL END AS gestion_haber,";
    strSQL += "  CASE WHEN ht.saldo > 0 AND ht.cuenta_funcion = '1' THEN ht.saldo ELSE NULL END AS funcion_debe,";
    strSQL += "  CASE WHEN ht.saldo < 0 AND ht.cuenta_funcion = '1' THEN -ht.saldo ELSE NULL END AS funcion_haber,";
    strSQL += "  CASE WHEN ht.saldo > 0 AND ht.cuenta_naturaleza = '1' THEN ht.saldo ELSE NULL END AS naturaleza_debe,";
    strSQL += "  CASE WHEN ht.saldo < 0 AND ht.cuenta_naturaleza = '1' THEN -ht.saldo ELSE NULL END AS naturaleza_haber";
    strSQL += " from (";
    strSQL += " select fct_libro_mayor_meses.*,";
	strSQL += "	(fct_libro_mayor_meses.debe-fct_libro_mayor_meses.haber)::numeric(14,4) as saldo,";
	strSQL += "	mct_cuentacontable.descripcion,";
	strSQL += "	mct_cuentacontable.cuenta_gestion,";
    strSQL += "    mct_cuentacontable.cuenta_balance,";
    strSQL += "    mct_cuentacontable.cuenta_funcion,";
    strSQL += "    mct_cuentacontable.cuenta_naturaleza";
    strSQL += " from fct_libro_mayor_meses($1,$2,$3,$4,$5,$6)";
    strSQL += " as ( id_master varchar(30),";
	strSQL += " debe numeric(14,4),";
    strSQL += " haber numeric(14,4)";
    strSQL += " ) left join mct_cuentacontable";
    strSQL += " on( fct_libro_mayor_meses.id_master = mct_cuentacontable.id_cuenta and";
    strSQL += "     $1 = mct_cuentacontable.id_usuario)";
    strSQL += " ) as ht";

    try {
        const todosReg = await pool.query(strSQL,[id_anfitrion,documento_id,periodo_ini,periodo_fin,id_libro,nivel]);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerAnalisis = async (req,res,next)=> {
    let strSQL;
    const {id_anfitrion,documento_id,periodo_ini,periodo_fin,id_libro,id_cuenta,ccosto} = req.params;

    strSQL = "select ht.*,";
    strSQL += "  CASE WHEN ht.saldo > 0 AND ht.cuenta_balance = '1' THEN ht.saldo ELSE NULL END AS balance_debe,";
    strSQL += "  CASE WHEN ht.saldo < 0 AND ht.cuenta_balance = '1' THEN -ht.saldo ELSE NULL END AS balance_haber,";
    strSQL += "  CASE WHEN ht.saldo > 0 AND ht.cuenta_gestion = '1' THEN ht.saldo ELSE NULL END AS gestion_debe,";
    strSQL += "  CASE WHEN ht.saldo < 0 AND ht.cuenta_gestion = '1' THEN -ht.saldo ELSE NULL END AS gestion_haber,";
    strSQL += "  CASE WHEN ht.saldo > 0 AND ht.cuenta_funcion = '1' THEN ht.saldo ELSE NULL END AS funcion_debe,";
    strSQL += "  CASE WHEN ht.saldo < 0 AND ht.cuenta_funcion = '1' THEN -ht.saldo ELSE NULL END AS funcion_haber,";
    strSQL += "  CASE WHEN ht.saldo > 0 AND ht.cuenta_naturaleza = '1' THEN ht.saldo ELSE NULL END AS naturaleza_debe,";
    strSQL += "  CASE WHEN ht.saldo < 0 AND ht.cuenta_naturaleza = '1' THEN -ht.saldo ELSE NULL END AS naturaleza_haber";
    strSQL += " from (";
    strSQL += " select fct_libro_mayor_meses.*,";
	strSQL += "	(fct_libro_mayor_meses.debe-fct_libro_mayor_meses.haber)::numeric(14,4) as saldo,";
	strSQL += "	mct_cuentacontable.descripcion,";
	strSQL += "	mct_cuentacontable.cuenta_gestion,";
    strSQL += "    mct_cuentacontable.cuenta_balance,";
    strSQL += "    mct_cuentacontable.cuenta_funcion,";
    strSQL += "    mct_cuentacontable.cuenta_naturaleza";
    strSQL += " from fct_libro_mayor_meses($1,$2,$3,$4,$5,$6)";
    strSQL += " as ( id_master varchar(30),";
	strSQL += " debe numeric(14,4),";
    strSQL += " haber numeric(14,4)";
    strSQL += " ) left join mct_cuentacontable";
    strSQL += " on( fct_libro_mayor_meses.id_master = mct_cuentacontable.id_cuenta and";
    strSQL += "     $1 = mct_cuentacontable.id_usuario)";
    strSQL += " ) as ht";

    try {
        const todosReg = await pool.query(strSQL,[id_anfitrion,documento_id,periodo_ini,periodo_fin,id_libro,id_cuenta,ccosto]);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

module.exports = {
    obtenerHojaTrabajo,
    obtenerAnalisis
 }; 