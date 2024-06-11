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
    const {id_anfitrion,documento_id,periodo_ini,periodo_fin,id_libro,id_cuenta} = req.params;

    let id_libroB = (id_libro !== null && id_libro !== undefined) ? id_libro+'%' : '%';
    let id_cuentaB = (id_cuenta !== null && id_cuenta !== undefined) ? id_cuenta+'%' : '%';


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
    strSQL += " ORDER BY mct_asientocontabledet.id_libro,mct_asientocontabledet.num_asiento,mct_asientocontabledet.item";
    
    const parametros = [id_anfitrion, documento_id, periodo_ini, periodo_fin, id_libroB, id_cuentaB];

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

/*const obtenerCuentasCorrientes = async (req,res,next)=> {
    let strSQL;
    const {id_anfitrion,documento_id,periodo_fin,saldo} = req.params;
    
    strSQL = "SELECT row_number() OVER () AS id, fct_cuentascorrientes.* ";
    strSQL += " ,(fct_cuentascorrientes.r_cod || '-' || fct_cuentascorrientes.r_serie || '-' || fct_cuentascorrientes.r_numero)::varchar(100) as r_comprobante";
    strSQL += " ,null::numeric as monto_efec";    
    strSQL += " FROM fct_cuentascorrientes($1,$2,$3)";
    strSQL += " AS (";
    strSQL += " tipo varchar(20),";
    strSQL += " id_cuenta varchar(17),";
    strSQL += " r_id_doc varchar(2),";
    strSQL += " r_documento_id varchar(20),";
    strSQL += " r_razon_social varchar(200),";
    strSQL += " r_fecemi varchar(50),";
    strSQL += " r_cod varchar(2),";
    strSQL += " r_serie varchar(5),";
    strSQL += " r_numero varchar(22),";
    strSQL += " saldo_soles numeric(14,2),";
    strSQL += " saldo_dolares numeric(14,2),";
    strSQL += " saldo_deudor_mn numeric,";
    strSQL += " saldo_acreedor_mn numeric,";
    strSQL += " saldo_deudor_me numeric,";
    strSQL += " saldo_acreedor_me numeric";
    strSQL += " ) ";
    if (saldo ==='deudores'){
        strSQL += " where saldo_deudor_mn > 0 or saldo_deudor_me > 0";
    }else{
        strSQL += " where saldo_acreedor_mn > 0 or saldo_acreedor_me > 0";
    }

    const parametros = [id_anfitrion, documento_id, periodo_fin];

    try {
        //console.log(strSQL);
        //console.log(parametros);
        const todosReg = await pool.query(strSQL,parametros);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};*/
const obtenerCuentasCorrientes = async (req, res, next) => {
    try {
        const { id_anfitrion, documento_id, periodo_fin, saldo } = req.params;

        // Validación de parámetros
        if ([id_anfitrion, documento_id, periodo_fin, saldo].some(param => param === null || param === undefined)) {
            return res.status(400).json({ error: 'Todos los parámetros son requeridos y no pueden ser null o undefined' });
        }

        // Construcción segura de la consulta SQL
        const baseQuery = `
            SELECT row_number() OVER () AS id, fct_cuentascorrientes.*,
                   (fct_cuentascorrientes.r_cod || '-' || fct_cuentascorrientes.r_serie || '-' || fct_cuentascorrientes.r_numero)::varchar(100) as r_comprobante,
                   null::numeric as monto_efec
            FROM fct_cuentascorrientes($1, $2, $3)
            AS (
                tipo varchar(20),
                id_cuenta varchar(17),
                r_id_doc varchar(2),
                r_documento_id varchar(20),
                r_razon_social varchar(200),
                r_fecemi varchar(50),
                r_cod varchar(2),
                r_serie varchar(5),
                r_numero varchar(22),
                saldo_soles numeric(14,2),
                saldo_dolares numeric(14,2),
                saldo_deudor_mn numeric,
                saldo_acreedor_mn numeric,
                saldo_deudor_me numeric,
                saldo_acreedor_me numeric
            )
        `;

        // Determinación de la cláusula WHERE basada en el parámetro 'saldo'
        const whereClause = saldo === 'deudores' 
            ? 'WHERE saldo_deudor_mn > 0 OR saldo_deudor_me > 0' 
            : 'WHERE saldo_acreedor_mn > 0 OR saldo_acreedor_me > 0';

        const strSQL = `${baseQuery} ${whereClause}`;
        const parametros = [id_anfitrion, documento_id, periodo_fin];

        // Ejecución de la consulta
        const todosReg = await pool.query(strSQL, parametros);
        res.json(todosReg.rows);

    } catch (error) {
        console.error('Error ejecutando la consulta:', error.message);
        res.status(500).json({ error: 'Error en el servidor' });
    }
};


module.exports = {
    obtenerHojaTrabajo,
    obtenerAnalisis,
    obtenerCuentasCorrientes
 }; 