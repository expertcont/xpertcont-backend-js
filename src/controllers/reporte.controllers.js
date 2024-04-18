const pool = require('../db');
const {devuelveCadena} = require('../utils/libreria.utils');

const obtenerHojaTrabajo = async (req,res,next)=> {
    let strSQL;
    const {id_anfitrion,documento_id,periodo_ini,periodo_fin,nivel,id_libro} = req.params;

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
	strSQL += "	(fct_libro_mayor_meses.debe-fct_libro_mayor_meses.haber)::numeric(14,2) as saldo,";
	strSQL += "	mct_cuentacontable.descripcion,";
	strSQL += "	mct_cuentacontable.cuenta_gestion,";
    strSQL += "    mct_cuentacontable.cuenta_balance,";
    strSQL += "    mct_cuentacontable.cuenta_funcion,";
    strSQL += "    mct_cuentacontable.cuenta_naturaleza";
    strSQL += " from fct_libro_mayor_meses($1,$2,$3,$4,$5,$6)";
    strSQL += " as ( id_master varchar(30),";
	strSQL += " debe numeric(14,2),";
    strSQL += " haber numeric(14,2)";
    strSQL += " ) left join mct_cuentacontable";
    strSQL += " on( fct_libro_mayor_meses.id_master = mct_cuentacontable.id_cuenta and";
    strSQL += "     $1 = mct_cuentacontable.id_usuario)";
    strSQL += " ) as ht";
    const parametros = [id_anfitrion,
                        documento_id,
                        periodo_ini,
                        periodo_fin
                        ,nivel,
                        devuelveCadena(id_libro)];
    try {
        const todosReg = await pool.query(strSQL,parametros);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerAnalisis = async (req,res,next)=> {
    let strSQL;
    const {id_anfitrion,documento_id,periodo_ini,periodo_fin,id_libro,id_cuenta,ccosto} = req.params;

    let id_libroB = (id_libro !== null && id_libro !== undefined) ? id_libro+'%' : '%';
    let id_cuentaB = (id_cuenta !== null && id_cuenta !== undefined) ? id_cuenta+'%' : '%';
    let ccostoB = (ccosto !== null && ccosto !== undefined) ? ccosto+'%' : '%';


    strSQL = "SELECT mct_asientocontabledet.periodo,";
    strSQL += " mct_librocontable.nombre_corto,";
    strSQL += " mct_asientocontabledet.num_asiento,";
    strSQL += " mct_asientocontabledet.item,";
    strSQL += " cast(mct_asientocontabledet.fecha_asiento as varchar)::varchar(50) as fecha_asiento,";
    strSQL += " mct_asientocontabledet.id_cuenta,";
    strSQL += " mct_asientocontabledet.r_id_doc,";
    strSQL += " mct_asientocontabledet.r_documento_id,";
    strSQL += " mct_asientocontabledet.r_razon_social,";
    strSQL += " mct_asientocontabledet.glosa,";
    strSQL += " cast(mct_asientocontabledet.r_fecemi as varchar)::varchar(50) as r_fecemi, cast(mct_asientocontabledet.r_fecvcto as varchar)::varchar(50) as r_fecvcto,";
    strSQL += " (mct_asientocontabledet.r_cod || '-' || mct_asientocontabledet.r_serie || '-' || mct_asientocontabledet.r_numero)::varchar(100) as r_comprobante,";
    strSQL += " cast(mct_asientocontabledet.r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref, cast(mct_asientocontabledet.r_fecvcto_ref as varchar)::varchar(50) as r_fecvcto_ref,";
    strSQL += " (mct_asientocontabledet.r_cod_ref || '-' || mct_asientocontabledet.r_serie_ref || '-' || mct_asientocontabledet.r_numero_ref)::varchar(100) as r_comprobante_ref,";
    strSQL += " mct_asientocontabledet.debe_nac, mct_asientocontabledet.haber_nac, mct_asientocontabledet.r_tc,";
    strSQL += " mct_asientocontabledet.debe_me, mct_asientocontabledet.haber_me";
    strSQL += " FROM ";
    strSQL += " mct_asientocontabledet inner join mct_librocontable";
    strSQL += " ON (mct_asientocontabledet.id_libro = mct_librocontable.id_libro)";
    strSQL += " WHERE mct_asientocontabledet.id_usuario = $1";
    strSQL += " AND mct_asientocontabledet.documento_id = $2";
    strSQL += " AND mct_asientocontabledet.periodo BETWEEN $3 AND $4";
    strSQL += " AND mct_asientocontabledet.id_libro like $5";
    strSQL += " AND mct_asientocontabledet.id_cuenta like $6";
    if (ccostoB !== '%') {
        strSQL += " AND mct_asientocontabledet.r_ccosto like $7";
    }
    strSQL += " ORDER BY mct_asientocontabledet.id_libro,mct_asientocontabledet.num_asiento,mct_asientocontabledet.item";
    
    const parametros = [id_anfitrion, documento_id, periodo_ini, periodo_fin, id_libroB, id_cuentaB];
    if (ccostoB !== '%') {
        parametros.push(ccostoB);
    }

    try {
        //console.log(strSQL);
        //console.log(parametros);
        const todosReg = await pool.query(strSQL,parametros);
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