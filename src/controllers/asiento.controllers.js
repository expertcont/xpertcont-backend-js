const pool = require('../db');
const xlsx = require('xlsx');
const { Readable } = require('stream');
const {devuelveCadenaNull,devuelveNumero, convertirFechaString, convertirFechaStringComplete, corregirTCPEN, corregirMontoNotaCredito} = require('../utils/libreria.utils');
const { from: copyFrom } = require('pg-copy-streams');
const { pipeline } = require('node:stream/promises');

const obtenerTodosAsientosCompra = async (req,res,next)=> {
    //Solo Cabeceras
    const {id_anfitrion, id_invitado, periodo, documento_id} = req.params;

    let strSQL;
    strSQL = "SELECT ";
        //01 ruc gen        (campos vacios)
        //02 razon gen      (campos vacios)
        //03 periodo gen    (campos vacios)
        //04 car sunat      (campos vacios)
    strSQL = strSQL + " cast(r_fecemi as varchar)::varchar(50) as r_fecemi";    //05
    strSQL = strSQL + " ,cast(r_fecvcto as varchar)::varchar(50) as r_fecvcto"; //06
    strSQL = strSQL + " ,r_cod";                                                //07
    strSQL = strSQL + " ,r_serie";                                              //08
    strSQL = strSQL + " ,r_ano_dam";                                            //09 año dua
    strSQL = strSQL + " ,r_numero";                                             //10
    strSQL = strSQL + " ,(r_cod || '-' || r_serie || '-' || r_numero)::varchar(50) as comprobante"; //(07-08-09)
    strSQL = strSQL + " ,r_numero2";                                            //11
    strSQL = strSQL + " ,r_id_doc";                                       //12
    strSQL = strSQL + " ,r_documento_id";                                       //13
    strSQL = strSQL + " ,r_razon_social";                                       //14
    strSQL = strSQL + " ,r_base001";                                            //15
    strSQL = strSQL + " ,r_igv001";                                             //16
    strSQL = strSQL + " ,r_base002";                                            //17
    strSQL = strSQL + " ,r_igv002";                                             //18
    strSQL = strSQL + " ,r_base003";                                            //19
    strSQL = strSQL + " ,r_igv003";                                             //20
    strSQL = strSQL + " ,r_base004";                                            //21
    strSQL = strSQL + " ,r_monto_isc";                                          //22
    strSQL = strSQL + " ,r_monto_icbp";                                         //23
    strSQL = strSQL + " ,r_monto_otros";                                        //24
    strSQL = strSQL + " ,r_monto_total";                                        //25
    strSQL = strSQL + " ,r_moneda";                                             //26
    strSQL = strSQL + " ,r_tc";                                                 //27
    strSQL = strSQL + " ,cast(r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref";//28
    strSQL = strSQL + " ,r_cod_ref";                                            //29
    strSQL = strSQL + " ,r_serie_ref";                                          //30
    strSQL = strSQL + " ,r_id_aduana";                                          //31
    strSQL = strSQL + " ,r_numero_ref";                                         //32
    
    strSQL = strSQL + " ,r_idbss";                                              //33
    strSQL = strSQL + " ,r_contrato_id";                                        //34
    strSQL = strSQL + " ,r_contrato_porc";                                      //35
    strSQL = strSQL + " ,r_impuesto_mat";                                       //36
    strSQL = strSQL + " ,r_car_cp";                                             //37 vacio

    strSQL = strSQL + " ,id_libro";
    strSQL = strSQL + " ,num_asiento";
    strSQL = strSQL + " ,glosa";
    strSQL = strSQL + " ,(r_cod_ref || '-' || r_serie_ref || '-' || r_numero_ref)::varchar(50) as comprobante_ref"; //(07-08-09)
    strSQL = strSQL + " ,origen";
    strSQL = strSQL + " ,retencion4ta"; //new
    strSQL = strSQL + " FROM";
    strSQL = strSQL + " mct_asientocontable ";
    strSQL = strSQL + " WHERE id_usuario = '" + id_anfitrion + "'";
    strSQL = strSQL + " AND documento_id = '" + documento_id + "'";
    strSQL = strSQL + " AND periodo = '" + periodo + "'";
    strSQL = strSQL + " AND id_libro = '008'"; //compras
    strSQL = strSQL + " ORDER BY num_asiento DESC";
    //console.log(strSQL);
    try {
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }

    //res.send('Listado de todas los zonas');
};

const obtenerTodosAsientosComparacion = async (req,res,next)=> {
    //Solo Cabeceras
    const {id_anfitrion, id_invitado, periodo, documento_id, id_libro} = req.params;

    let strSQL;
    strSQL = "SELECT ";
    strSQL += " 'SIRE - XPERT'::varchar(20) as resultado";
    strSQL += " ,cast(t1.r_fecemi as varchar)::varchar(50) as r_fecemi";
    strSQL += " ,cast(t1.r_fecvcto as varchar)::varchar(50) as r_fecvcto";
    strSQL += " ,(t1.r_cod || '-' || t1.r_serie || '-' || t1.r_numero)::varchar(50) as comprobante";
    strSQL += " ,t1.r_id_doc";
    strSQL += " ,t1.r_documento_id";
    strSQL += " ,t1.r_razon_social";
    strSQL += " ,t1.r_monto_total"; //caso de null o ceros sale diferente, por eso usare coalesce, para igualarlos
    strSQL += " ,t1.r_moneda";
    strSQL += " ,t1.r_tc";
    strSQL += " ,cast(t1.r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref";
    strSQL += " ,t1.r_cod_ref";
    strSQL += " ,t1.r_serie_ref";
    strSQL += " ,t1.r_numero_ref";
    strSQL += " ,t1.r_id_aduana";
    strSQL += " ,t1.r_ano_dam";
    strSQL += " ,t1.num_asiento";
    strSQL += " FROM mct_asientocontable t1";
    strSQL += " WHERE t1.id_usuario = '" + id_anfitrion + "'";
    strSQL += " AND t1.documento_id = '" + documento_id + "'";
    strSQL += " AND t1.periodo = '" + periodo + "'";
    strSQL += " AND t1.id_libro = '" + id_libro + "'";
    strSQL += " AND t1.origen = 'SIRE'";
    strSQL += " AND NOT EXISTS (";
    strSQL += "    SELECT 1";
    strSQL += "    FROM mct_asientocontable t2";
    strSQL += "    WHERE t2.id_usuario = '" + id_anfitrion + "'";
    strSQL += "    AND t2.documento_id = '" + documento_id + "'";
    strSQL += "    AND t2.periodo = '" + periodo + "'";
    strSQL += "    AND t2.id_libro = '" + id_libro + "'";
    strSQL += "    AND t2.origen <> 'SIRE'";
       
    strSQL += "    AND t1.r_cod = t2.r_cod";
    strSQL += "    AND t1.r_serie = t2.r_serie";
    strSQL += "    AND t1.r_numero = t2.r_numero";
    strSQL += "    AND t1.r_fecemi = t2.r_fecemi";
    strSQL += "    AND COALESCE(t1.r_monto_total,0) = COALESCE(t2.r_monto_total,0)";
    strSQL += "    AND t1.r_moneda = t2.r_moneda";
    strSQL += " )";

    strSQL += " UNION ALL ";

    strSQL += " SELECT ";
    strSQL += " 'XPERT - SIRE'::varchar(20) as resultado";
    strSQL += " ,cast(t1.r_fecemi as varchar)::varchar(50) as r_fecemi";
    strSQL += " ,cast(t1.r_fecvcto as varchar)::varchar(50) as r_fecvcto";
    strSQL += " ,(t1.r_cod || '-' || t1.r_serie || '-' || t1.r_numero)::varchar(50) as comprobante";
    strSQL += " ,t1.r_id_doc";
    strSQL += " ,t1.r_documento_id";
    strSQL += " ,t1.r_razon_social";
    strSQL += " ,t1.r_monto_total";
    strSQL += " ,t1.r_moneda";
    strSQL += " ,t1.r_tc";
    strSQL += " ,cast(t1.r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref";
    strSQL += " ,t1.r_cod_ref";
    strSQL += " ,t1.r_serie_ref";
    strSQL += " ,t1.r_numero_ref";
    strSQL += " ,t1.r_id_aduana";
    strSQL += " ,t1.r_ano_dam";
    strSQL += " ,t1.num_asiento";
    strSQL += " FROM mct_asientocontable t1";
    strSQL += " WHERE t1.id_usuario = '" + id_anfitrion + "'";
    strSQL += " AND t1.documento_id = '" + documento_id + "'";
    strSQL += " AND t1.periodo = '" + periodo + "'";
    strSQL += " AND t1.id_libro = '" + id_libro + "'";
    strSQL += " AND t1.origen <> 'SIRE'";
    strSQL += " AND NOT EXISTS (";
    strSQL += "    SELECT 1";
    strSQL += "    FROM mct_asientocontable t2";
    strSQL += "    WHERE t2.id_usuario = '" + id_anfitrion + "'";
    strSQL += "    AND t2.documento_id = '" + documento_id + "'";
    strSQL += "    AND t2.periodo = '" + periodo + "'";
    strSQL += "    AND t2.id_libro = '" + id_libro + "'";
    strSQL += "    AND t2.origen = 'SIRE'";
       
    strSQL += "    AND t1.r_cod = t2.r_cod";
    strSQL += "    AND t1.r_serie = t2.r_serie";
    strSQL += "    AND t1.r_numero = t2.r_numero";
    strSQL += "    AND t1.r_fecemi = t2.r_fecemi";
    strSQL += "    AND COALESCE(t1.r_monto_total,0) = COALESCE(t2.r_monto_total,0)";
    strSQL += "    AND t1.r_moneda = t2.r_moneda";
    strSQL += " )";

    //console.log(strSQL);
    try {
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosAsientosPrev = async (req,res,next)=> {
    //Solo Cabeceras
    const {id_anfitrion, periodo, documento_id, id_libro} = req.params;

    let strSQL;
    strSQL = "SELECT 'Por Contabilizar'::varchar(20) as resultado";
    strSQL += " ,cast(r_fecemi as varchar)::varchar(50) as r_fecemi";
    strSQL += " ,cast(r_fecvcto as varchar)::varchar(50) as r_fecvcto";
    strSQL += " ,(r_cod || '-' || r_serie || '-' || r_numero)::varchar(50) as comprobante";
    strSQL += " ,r_cod";
    strSQL += " ,r_serie";
    strSQL += " ,r_numero";
    strSQL += " ,r_numero2";
    strSQL += " ,r_id_doc";
    strSQL += " ,r_documento_id";
    strSQL += " ,r_razon_social";
    strSQL += " ,r_monto_total"; 
    strSQL += " ,r_moneda";
    strSQL += " ,r_tc";
    strSQL += " ,cast(r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref";
    strSQL += " ,r_cod_ref";
    strSQL += " ,r_serie_ref";
    strSQL += " ,r_numero_ref";
    strSQL += " ,r_id_aduana";
    strSQL += " ,r_ano_dam";
    strSQL += " ,origen";
    strSQL += " ,num_asiento";
    strSQL += " ,r_base001";
    strSQL += " ,r_base002";
    strSQL += " ,r_base003";
    strSQL += " ,r_base004";
    strSQL += " ,r_igv001";
    strSQL += " ,r_igv002";
    strSQL += " ,r_igv003";
    strSQL += " ,r_monto_icbp";
    strSQL += " FROM mct_asientocontable AS ac";
    strSQL += " WHERE ac.id_usuario = '" + id_anfitrion + "'";
    strSQL += " AND ac.documento_id = '" + documento_id + "'";
    strSQL += " AND ac.periodo = '" + periodo + "'";
    strSQL += " AND ac.id_libro = '" + id_libro + "'";
    strSQL += " AND NOT EXISTS (";
    strSQL += "         SELECT 1";
    strSQL += "         FROM mct_asientocontabledet AS acd";
    strSQL += "         WHERE";
    strSQL += "             acd.id_usuario = ac.id_usuario";
    strSQL += "             AND acd.documento_id = ac.documento_id";
    strSQL += "             AND acd.periodo = ac.periodo";
    strSQL += "             AND acd.id_libro = ac.id_libro";
    strSQL += "             AND acd.num_asiento = ac.num_asiento";
    strSQL += "     )";
    
    //console.log(strSQL);
    try {
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerTodosAsientosPrevCaja = async (req,res,next)=> {
    //Listado con cuentas corrientes 12,13,42,43 ... y demas solicitas
    //para generar contrasasiento de cancelacion
    const {id_anfitrion, periodo, documento_id, id_libro} = req.params;

    let strSQL;
    strSQL = "SELECT 'Por Contabilizar'::varchar(20) as resultado";
    strSQL += " ,cast(r_fecemi as varchar)::varchar(50) as r_fecemi";
    strSQL += " ,cast(r_fecvcto as varchar)::varchar(50) as r_fecvcto";
    strSQL += " ,(r_cod || '-' || r_serie || '-' || r_numero)::varchar(50) as comprobante";
    strSQL += " ,r_cod";
    strSQL += " ,r_serie";
    strSQL += " ,r_numero";
    strSQL += " ,r_numero2";
    strSQL += " ,r_id_doc";
    strSQL += " ,r_documento_id";
    strSQL += " ,r_razon_social";
    strSQL += " ,r_monto_total"; 
    strSQL += " ,r_moneda";
    strSQL += " ,r_tc";
    strSQL += " ,cast(r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref";
    strSQL += " ,r_cod_ref";
    strSQL += " ,r_serie_ref";
    strSQL += " ,r_numero_ref";
    strSQL += " ,r_id_aduana";
    strSQL += " ,r_ano_dam";
    strSQL += " ,origen";
    strSQL += " ,num_asiento";
    strSQL += " ,r_base001";
    strSQL += " ,r_base002";
    strSQL += " ,r_base003";
    strSQL += " ,r_base004";
    strSQL += " ,r_igv001";
    strSQL += " ,r_igv002";
    strSQL += " ,r_igv003";
    strSQL += " ,r_monto_icbp";
    strSQL += " FROM mct_asientocontable AS ac";
    strSQL += " WHERE ac.id_usuario = '" + id_anfitrion + "'";
    strSQL += " AND ac.documento_id = '" + documento_id + "'";
    strSQL += " AND ac.periodo = '" + periodo + "'";
    strSQL += " AND ac.id_libro = '" + id_libro + "'";
    strSQL += " AND NOT EXISTS (";
    strSQL += "         SELECT 1";
    strSQL += "         FROM mct_asientocontabledet AS acd";
    strSQL += "         WHERE";
    strSQL += "             acd.id_usuario = ac.id_usuario";
    strSQL += "             AND acd.documento_id = ac.documento_id";
    strSQL += "             AND acd.periodo = ac.periodo";
    strSQL += "             AND acd.id_libro = ac.id_libro";
    strSQL += "             AND acd.num_asiento = ac.num_asiento";
    strSQL += "     )";
    
    //console.log(strSQL);
    try {
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerTodosAsientosVenta = async (req,res,next)=> {
    //Solo Cabeceras
    const {id_anfitrion, id_invitado, periodo, documento_id} = req.params;

    let strSQL;
    strSQL = "SELECT ";
        //01 ruc gen        (campos vacios)
        //02 razon gen      (campos vacios)
        //03 periodo gen    (campos vacios)
        //04 car sunat      (campos vacios)
    strSQL = strSQL + "  cast(r_fecemi as varchar)::varchar(50) as r_fecemi";   //05
    strSQL = strSQL + " ,cast(r_fecvcto as varchar)::varchar(50) as r_fecvcto"; //06
    strSQL = strSQL + " ,r_cod";                                                //07
    strSQL = strSQL + " ,r_serie";                                              //08
    strSQL = strSQL + " ,r_numero";                                             //09
    strSQL = strSQL + " ,(r_cod || '-' || r_serie || '-' || r_numero)::varchar(50) as comprobante"; //(07-08-09)
    strSQL = strSQL + " ,r_numero2";                                            //10
    strSQL = strSQL + " ,r_id_doc";                                             //11
    strSQL = strSQL + " ,r_documento_id";                                       //12
    strSQL = strSQL + " ,r_razon_social";                                       //13
    strSQL = strSQL + " ,r_base001 as export";                                  //14
    strSQL = strSQL + " ,r_base002 as base";                                    //15
    strSQL = strSQL + " ,r_igv002 as igv";                                      //16
    strSQL = strSQL + " ,r_base003 as exonera";                                 //17
    strSQL = strSQL + " ,r_base004 as inafecta";                                //18
    strSQL = strSQL + " ,r_monto_icbp";                                         //19
    strSQL = strSQL + " ,r_monto_otros";                                        //20
    strSQL = strSQL + " ,r_monto_total";                                        //21
    strSQL = strSQL + " ,r_moneda";                                             //22
    strSQL = strSQL + " ,r_tc";                                                 //23
    strSQL = strSQL + " ,cast(r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref";//24
    strSQL = strSQL + " ,r_cod_ref";                                            //25
    strSQL = strSQL + " ,r_serie_ref";                                          //26
    strSQL = strSQL + " ,r_numero_ref";                                         //27
    
    strSQL = strSQL + " ,id_libro";
    strSQL = strSQL + " ,num_asiento";
    strSQL = strSQL + " ,glosa";
    strSQL = strSQL + " ,(r_cod_ref || '-' || r_serie_ref || '-' || r_numero_ref)::varchar(50) as comprobante_ref"; //(07-08-09)
    strSQL = strSQL + " ,origen";

    strSQL = strSQL + " FROM";
    strSQL = strSQL + " mct_asientocontable ";
    strSQL = strSQL + " WHERE id_usuario = '" + id_anfitrion + "'";
    strSQL = strSQL + " AND documento_id = '" + documento_id + "'";
    strSQL = strSQL + " AND periodo = '" + periodo + "'";
    strSQL = strSQL + " AND id_libro = '014'"; //ventas
    strSQL = strSQL + " ORDER BY num_asiento DESC";
    console.log(strSQL);
    try {
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
    //res.send('Listado de todas los zonas');
};

const obtenerTodosAsientosCaja = async (req,res,next)=> {
    //Solo Cabeceras
    const {id_anfitrion, id_invitado, periodo, documento_id} = req.params;

    let strSQL;
    strSQL = "SELECT ";
        //01 ruc gen        (campos vacios)
        //02 razon gen      (campos vacios)
        //03 periodo gen    (campos vacios)
        //04 car sunat      (campos vacios)
    strSQL = strSQL + "  cast(r_fecemi as varchar)::varchar(50) as r_fecemi";   //05
    strSQL = strSQL + " ,cast(r_fecvcto as varchar)::varchar(50) as r_fecvcto"; //06
    strSQL = strSQL + " ,r_cod";                                                //07
    strSQL = strSQL + " ,r_serie";                                              //08
    strSQL = strSQL + " ,r_numero";                                             //09
    strSQL = strSQL + " ,(r_cod || '-' || r_serie || '-' || r_numero)::varchar(50) as comprobante"; //(07-08-09)
    strSQL = strSQL + " ,r_numero2";                                            //10
    strSQL = strSQL + " ,r_id_doc";                                             //11
    strSQL = strSQL + " ,r_documento_id";                                       //12
    strSQL = strSQL + " ,r_razon_social";                                       //13
    strSQL = strSQL + " ,r_base001 as export";                                  //14
    strSQL = strSQL + " ,r_base002 as base";                                    //15
    strSQL = strSQL + " ,r_igv002 as igv";                                      //16
    strSQL = strSQL + " ,r_base003 as exonera";                                 //17
    strSQL = strSQL + " ,r_base004 as inafecta";                                //18
    strSQL = strSQL + " ,r_monto_icbp";                                         //19
    strSQL = strSQL + " ,r_monto_otros";                                        //20
    strSQL = strSQL + " ,r_monto_total";                                        //21
    strSQL = strSQL + " ,r_moneda";                                             //22
    strSQL = strSQL + " ,r_tc";                                                 //23
    strSQL = strSQL + " ,cast(r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref";//24
    strSQL = strSQL + " ,r_cod_ref";                                            //25
    strSQL = strSQL + " ,r_serie_ref";                                          //26
    strSQL = strSQL + " ,r_numero_ref";                                         //27
    
    strSQL = strSQL + " ,id_libro";
    strSQL = strSQL + " ,num_asiento";
    strSQL = strSQL + " ,glosa";
    strSQL = strSQL + " ,(r_cod_ref || '-' || r_serie_ref || '-' || r_numero_ref)::varchar(50) as comprobante_ref"; //(07-08-09)

    strSQL = strSQL + " FROM";
    strSQL = strSQL + " mct_asientocontable ";
    strSQL = strSQL + " WHERE id_usuario = '" + id_anfitrion + "'";
    strSQL = strSQL + " AND documento_id = '" + documento_id + "'";
    strSQL = strSQL + " AND periodo = '" + periodo + "'";
    strSQL = strSQL + " AND id_libro = '001'"; //caja
    strSQL = strSQL + " ORDER BY num_asiento DESC";
    console.log(strSQL);
    try {
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
    //res.send('Listado de todas los zonas');
};

const obtenerTodosAsientosDiario = async (req,res,next)=> {
    //Solo Cabeceras
    const {id_anfitrion, id_invitado, periodo, documento_id} = req.params;

    let strSQL;
    strSQL = "SELECT ";
        //01 ruc gen        (campos vacios)
        //02 razon gen      (campos vacios)
        //03 periodo gen    (campos vacios)
        //04 car sunat      (campos vacios)
    strSQL = strSQL + "  cast(r_fecemi as varchar)::varchar(50) as r_fecemi";   //05
    strSQL = strSQL + " ,cast(r_fecvcto as varchar)::varchar(50) as r_fecvcto"; //06
    strSQL = strSQL + " ,r_cod";                                                //07
    strSQL = strSQL + " ,r_serie";                                              //08
    strSQL = strSQL + " ,r_numero";                                             //09
    strSQL = strSQL + " ,(r_cod || '-' || r_serie || '-' || r_numero)::varchar(50) as comprobante"; //(07-08-09)
    strSQL = strSQL + " ,r_numero2";                                            //10
    strSQL = strSQL + " ,r_id_doc";                                             //11
    strSQL = strSQL + " ,r_documento_id";                                       //12
    strSQL = strSQL + " ,r_razon_social";                                       //13
    strSQL = strSQL + " ,r_base001 as export";                                  //14
    strSQL = strSQL + " ,r_base002 as base";                                    //15
    strSQL = strSQL + " ,r_igv002 as igv";                                      //16
    strSQL = strSQL + " ,r_base003 as exonera";                                 //17
    strSQL = strSQL + " ,r_base004 as inafecta";                                //18
    strSQL = strSQL + " ,r_monto_icbp";                                         //19
    strSQL = strSQL + " ,r_monto_otros";                                        //20
    strSQL = strSQL + " ,r_monto_total";                                        //21
    strSQL = strSQL + " ,r_moneda";                                             //22
    strSQL = strSQL + " ,r_tc";                                                 //23
    strSQL = strSQL + " ,cast(r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref";//24
    strSQL = strSQL + " ,r_cod_ref";                                            //25
    strSQL = strSQL + " ,r_serie_ref";                                          //26
    strSQL = strSQL + " ,r_numero_ref";                                         //27
    
    strSQL = strSQL + " ,id_libro";
    strSQL = strSQL + " ,num_asiento";
    strSQL = strSQL + " ,glosa";
    strSQL = strSQL + " ,(r_cod_ref || '-' || r_serie_ref || '-' || r_numero_ref)::varchar(50) as comprobante_ref"; //(07-08-09)

    strSQL = strSQL + " FROM";
    strSQL = strSQL + " mct_asientocontable ";
    strSQL = strSQL + " WHERE id_usuario = '" + id_anfitrion + "'";
    strSQL = strSQL + " AND documento_id = '" + documento_id + "'";
    strSQL = strSQL + " AND periodo = '" + periodo + "'";
    strSQL = strSQL + " AND id_libro = '005'"; //diario
    strSQL = strSQL + " ORDER BY num_asiento DESC";
    console.log(strSQL);
    try {
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
    //res.send('Listado de todas los zonas');
};

const generarSireCompras = async (req,res,next)=> {
    //Solo Cabeceras
    const {id_anfitrion, documento_id, razon_social, periodo} = req.params;

    let strSQL;
    strSQL = "SELECT ";
    strSQL += "  $2 as ruc";    //01 ruc
    strSQL += " ,$3 as razon";    //02 razon gen
    strSQL += " ,replace($4,'-','') as periodo";    //03 periodo
    strSQL += " ,''::varchar(20) as car_sunat";    //04 car sunat
    //strSQL += " ,cast(r_fecemi as varchar)::varchar(50) as r_fecemi";   //05
    //strSQL += " ,cast(r_fecvcto as varchar)::varchar(50) as r_fecvcto"; //06
    strSQL += " ,to_char(r_fecemi,'DD/MM/YYYY')::varchar(12) as r_fecemi";   //05 formato sire
    strSQL += " ,to_char(r_fecvcto,'DD/MM/YYYY')::varchar(12) as r_fecvcto"; //06 formato sire
    strSQL += " ,r_cod";                                                //07
    strSQL += " ,r_serie";                                              //08
    strSQL += " ,r_ano_dam";                                            //09 año dua
    strSQL += " ,r_numero";                                             //10
    strSQL += " ,r_numero2";                                            //11
    strSQL += " ,r_id_doc";                                             //12
    strSQL += " ,r_documento_id";                                       //13
    strSQL += " ,r_razon_social";                                       //14
    //Aqui los montos necesitan CERO, para SIRE sino sale error

    strSQL += " ,coalesce(r_base001,0) as r_base001";                                            //15
    strSQL += " ,coalesce(r_igv001,0) as r_igv001";                                             //16
    strSQL += " ,coalesce(r_base002,0) as r_base002";                                            //17
    strSQL += " ,coalesce(r_igv002,0) as r_igv002";                                             //18
    strSQL += " ,coalesce(r_base003,0) as r_base003";                                            //19
    strSQL += " ,coalesce(r_igv003,0) as r_igv003";                                             //20
    strSQL += " ,coalesce(r_base004,0) as r_base004";                                            //21 no gravado
    strSQL += " ,coalesce(r_monto_isc,0) as r_monto_isc";                                          //22
    strSQL += " ,coalesce(r_monto_icbp,0) as r_monto_icbp";                                         //23
    strSQL += " ,coalesce(r_monto_otros,0) as r_monto_otros";                                        //24
    strSQL += " ,coalesce(r_monto_total,0) as r_monto_total";                                        //25
    
    strSQL += " ,r_moneda";                                             //26
    strSQL += " ,r_tc";                                                 //27
    //strSQL += " ,cast(r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref";//28
    strSQL += " ,to_char(r_fecemi_ref,'DD/MM/YYYY')::varchar(12) as r_fecemi_ref"; //28 formato sire    
    strSQL += " ,r_cod_ref";                                            //29
    strSQL += " ,r_serie_ref";                                          //30
    strSQL += " ,r_id_aduana";                                          //31
    strSQL += " ,r_numero_ref";                                         //32
    
    strSQL += " ,r_idbss";                                              //33
    strSQL += " ,r_contrato_id";                                        //34
    strSQL += " ,r_contrato_porc";                                      //35
    strSQL += " ,r_impuesto_mat";                                       //36
    strSQL += " ,r_car_cp";                                             //37 vacio CAR CP a modificar

    strSQL += " FROM";
    strSQL += " mct_asientocontable ";

    strSQL += " WHERE id_usuario = $1";
    strSQL += " AND documento_id = $2";
    strSQL += " AND periodo = $4";
    //strSQL += " AND r_moneda = $5"; //new La moneda no se tiene en cuenta por el momento
    strSQL += " AND id_libro = '008'"; //compras
    strSQL += " AND r_cod <> '91'"; //no domiciliados
    strSQL += " AND r_cod <> '97'"; //no domiciliados
    strSQL += " AND r_cod <> '98'"; //no domiciliados
    strSQL += " ORDER BY num_asiento DESC";
    //console.log(strSQL);
    try {
        const todosReg = await pool.query(strSQL,[id_anfitrion, documento_id, razon_social, periodo]);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const generarSireComprasNoDomic = async (req,res,next)=> {
    //Solo Cabeceras
    const {id_anfitrion, documento_id, razon_social, periodo} = req.params;

    let strSQL;
    strSQL = "SELECT ";
    strSQL += "  $2 as ruc";    //01 ruc
    strSQL += " ,$3 as razon";    //02 razon gen
    strSQL += " ,replace($4,'-','') as periodo";    //03 periodo
    strSQL += " ,''::varchar(20) as car_sunat";    //04 car sunat
    //strSQL += " ,cast(r_fecemi as varchar)::varchar(50) as r_fecemi";   //05
    //strSQL += " ,cast(r_fecvcto as varchar)::varchar(50) as r_fecvcto"; //06
    strSQL += " ,to_char(r_fecemi,'DD/MM/YYYY')::varchar(12) as r_fecemi";   //05 formato sire
    strSQL += " ,to_char(r_fecvcto,'DD/MM/YYYY')::varchar(12) as r_fecvcto"; //06 formato sire
    strSQL += " ,r_cod";                                                //07
    strSQL += " ,r_serie";                                              //08
    strSQL += " ,r_ano_dam";                                            //09 año dua
    strSQL += " ,r_numero";                                             //10
    strSQL += " ,r_numero2";                                            //11
    strSQL += " ,r_id_doc";                                             //12
    strSQL += " ,r_documento_id";                                       //13
    strSQL += " ,r_razon_social";                                       //14
    //Aqui los montos necesitan CERO, para SIRE sino sale error

    strSQL += " ,coalesce(r_base001,0) as r_base001";                                            //15
    strSQL += " ,coalesce(r_igv001,0) as r_igv001";                                             //16
    strSQL += " ,coalesce(r_base002,0) as r_base002";                                            //17
    strSQL += " ,coalesce(r_igv002,0) as r_igv002";                                             //18
    strSQL += " ,coalesce(r_base003,0) as r_base003";                                            //19
    strSQL += " ,coalesce(r_igv003,0) as r_igv003";                                             //20
    strSQL += " ,coalesce(r_base004,0) as r_base004";                                            //21 no gravado
    strSQL += " ,coalesce(r_monto_isc,0) as r_monto_isc";                                          //22
    strSQL += " ,coalesce(r_monto_icbp,0) as r_monto_icbp";                                         //23
    strSQL += " ,coalesce(r_monto_otros,0) as r_monto_otros";                                        //24
    strSQL += " ,coalesce(r_monto_total,0) as r_monto_total";                                        //25
    
    strSQL += " ,r_moneda";                                             //26
    strSQL += " ,r_tc";                                                 //27
    //strSQL += " ,cast(r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref";//28
    strSQL += " ,to_char(r_fecemi_ref,'DD/MM/YYYY')::varchar(12) as r_fecemi_ref"; //28 formato sire    
    strSQL += " ,r_cod_ref";                                            //29
    strSQL += " ,r_serie_ref";                                          //30
    strSQL += " ,r_id_aduana";                                          //31
    strSQL += " ,r_numero_ref";                                         //32
    
    strSQL += " ,r_idbss";                                              //33
    strSQL += " ,r_contrato_id";                                        //34
    strSQL += " ,r_contrato_porc";                                      //35
    strSQL += " ,r_impuesto_mat";                                       //36
    strSQL += " ,r_car_cp";                                             //37 vacio CAR CP a modificar

    strSQL += " FROM";
    strSQL += " mct_asientocontable ";

    strSQL += " WHERE id_usuario = $1";
    strSQL += " AND documento_id = $2";
    strSQL += " AND periodo = $4";
    //strSQL += " AND r_moneda = $5"; //new La moneda no se tiene en cuenta por el momento
    strSQL += " AND id_libro = '008'"; //compras
    strSQL += " AND r_cod = '91'"; //no domiciliados
    strSQL += " AND r_cod = '97'"; //no domiciliados
    strSQL += " AND r_cod = '98'"; //no domiciliados
    strSQL += " ORDER BY num_asiento DESC";
    //console.log(strSQL);
    try {
        const todosReg = await pool.query(strSQL,[id_anfitrion, documento_id, razon_social, periodo]);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const generarSireVentas = async (req,res,next)=> {
    //Solo Cabeceras
    const {id_anfitrion, documento_id, razon_social, periodo} = req.params;

    let strSQL;
    strSQL = "SELECT ";
    strSQL += "  $2 as ruc";    //01 ruc
    strSQL += " ,$3 as razon";    //02 razon gen
    strSQL += " ,replace($4,'-','') as periodo";    //03 periodo
    strSQL += " ,''::varchar(20) as car_sunat";    //04 car sunat

    strSQL += " ,to_char(r_fecemi,'DD/MM/YYYY')::varchar(12) as r_fecemi";   //05 formato sire
    strSQL += " ,to_char(r_fecvcto,'DD/MM/YYYY')::varchar(12) as r_fecvcto"; //06 formato sire
    //strSQL += " ,cast(r_fecemi as varchar)::varchar(50) as r_fecemi";   //05
    //strSQL += " ,cast(r_fecvcto as varchar)::varchar(50) as r_fecvcto"; //06
    strSQL += " ,r_cod";                                                //07
    strSQL += " ,r_serie";                                              //08
    strSQL += " ,r_numero";                                             //09
    strSQL += " ,r_numero2";                                            //10
    strSQL += " ,r_id_doc";                                             //11
    strSQL += " ,r_documento_id";                                       //12
    strSQL += " ,r_razon_social";                                       //13
    
    strSQL += " ,coalesce(r_base001,0) as r_base001";                                            //14 export
    strSQL += " ,coalesce(r_base002,0) as r_base002";                                            //15 base grav
    strSQL += " ,coalesce(r_base_desc,0) as r_base_desc";                                          //16 base desc
    strSQL += " ,coalesce(r_igv002,0) as r_igv002";                                             //17 igv grv
    strSQL += " ,coalesce(r_igv_desc,0) as r_igv_desc";                                           //18 igv desc
    strSQL += " ,coalesce(r_base003,0) as r_base003";                                            //19 exonerado
    strSQL += " ,coalesce(r_base004,0) as r_base004";                                            //20 inafecto
    strSQL += " ,coalesce(r_monto_isc,0) as r_monto_isc";                                          //21
    strSQL += " ,coalesce(r_base_ivap,0) as r_base_ivap";                                          //22
    strSQL += " ,coalesce(r_igv_ivap,0) as r_igv_ivap";                                           //23
    strSQL += " ,coalesce(r_monto_icbp,0) as r_monto_icbp";                                         //24
    strSQL += " ,coalesce(r_monto_otros,0) as r_monto_otros";                                        //25
    strSQL += " ,coalesce(r_monto_total,0) as r_monto_total";                                        //26
    
    strSQL += " ,r_moneda";                                             //27
    strSQL += " ,r_tc";                                                 //28
    //strSQL += " ,cast(r_fecemi_ref as varchar)::v//archar(50) as r_fecemi_ref";//29
    strSQL += " ,to_char(r_fecemi_ref,'DD/MM/YYYY')::varchar(12) as r_fecemi_ref"; //29 formato sire
    strSQL += " ,r_cod_ref";                                            //30
    strSQL += " ,r_serie_ref";                                          //31
    strSQL += " ,r_numero_ref";                                         //32
    strSQL += " ,r_contrato_id";                                        //33
    strSQL += " FROM";
    strSQL += " mct_asientocontable ";
    strSQL += " WHERE id_usuario = $1";
    strSQL += " AND documento_id = $2";
    strSQL += " AND periodo = $4";
    //strSQL += " AND r_moneda = $5";     //new La moneda no se tiene en cuenta por el momento
    strSQL += " AND id_libro = '014'";  //Ventas
    strSQL += " ORDER BY num_asiento DESC";
    //console.log(strSQL);
    try {
        const todosReg = await pool.query(strSQL,[id_anfitrion, documento_id, razon_social, periodo]);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerTodosAsientosPlan = async (req,res,next)=> {
    //Modo Detalles 
    //Version analizado, util para formato excel
    const {id_usuario, ano, mes, id_libro} = req.params;

    let strSQL;
    strSQL = "SELECT mct_asientocontabledet.ano";
    strSQL = strSQL + " ,mct_asientocontabledet.mes";
    strSQL = strSQL + " ,mct_asientocontabledet.id_libro";
    strSQL = strSQL + " ,mct_asientocontabledet.num_asiento";
    strSQL = strSQL + " ,mct_asientocontabledet.item"; //dato unico en detalle
    strSQL = strSQL + " ,cast(mct_asientocontabledet.fecha_asiento as varchar)::varchar(50) as fecha_asiento";
    strSQL = strSQL + " ,mct_asientocontabledet.glosa";

    strSQL = strSQL + " ,mct_asientocontabledet.r_documento_id";
    strSQL = strSQL + " ,(mct_asientocontabledet.r_cod";                                           //comprobante
    strSQL = strSQL + "   || '-' || mct_asientocontabledet.r_serie";                               //comprobante
    strSQL = strSQL + "   || '-' || mct_asientocontabledet.r_numero)::varchar(50) as comprobante"; //comprobante
    strSQL = strSQL + " ,cast(mct_asientocontabledet.r_fecemi as varchar)::varchar(50) as r_fecemi";
    strSQL = strSQL + " ,(mct_asientocontabledet.r_cod_ref";                                           //comprobante_ref
    strSQL = strSQL + "   || '-' || mct_asientocontabledet.r_serie_ref";                               //comprobante_ref
    strSQL = strSQL + "   || '-' || mct_asientocontabledet.r_numero_ref)::varchar(50) as comprobante_ref"; //comprobante_ref
    
    strSQL = strSQL + " ,mct_asientocontabledet.id_cuenta";
    strSQL = strSQL + " ,mct_cuenta.descripcion";
    strSQL = strSQL + " ,mct_asientocontabledet.debe_nac";
    strSQL = strSQL + " ,mct_asientocontabledet.haber_nac";
    strSQL = strSQL + " ,mct_asientocontabledet.debe_me";
    strSQL = strSQL + " ,mct_asientocontabledet.haber_me";
    strSQL = strSQL + " ,mct_asientocontabledet.tc";

    strSQL = strSQL + " FROM";
    strSQL = strSQL + " mct_asientocontabledet LEFT JOIN mct_cuenta";
    strSQL = strSQL + " ON (mct_asientocontabledet.id_usuario = mct_cuenta.id_usuario and ";
    strSQL = strSQL + "     mct_asientocontabledet.plantilla = mct_cuenta.plantilla and ";
    strSQL = strSQL + "     mct_asientocontabledet.id_cuenta = mct_cuenta.id_cuenta ) ";
    //cuidado diseñar tabla para trabajo por (años) o (plantilla) en caso de cambio contable tributario sunat

    strSQL = strSQL + " WHERE mct_asientocontabledet.id_usuario = '" + id_usuario + "'";
    strSQL = strSQL + " AND mct_asientocontabledet.ano = '" + ano + "'";
    strSQL = strSQL + " AND mct_asientocontabledet.mes = '" + mes + "'";
    strSQL = strSQL + " AND mct_asientocontabledet.id_libro = '" + id_libro + "'";
    strSQL = strSQL + " ORDER BY mct_asientocontabledet.num_asiento DESC";

    try {
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerAsiento = async (req,res,next)=> {
    try {
        const {id_anfitrion,documento_id,periodo,id_libro,num_asiento} = req.params;
        let strSQL ;
        
        strSQL = "SELECT mct_asientocontable.* ";
        strSQL = strSQL + " ,cast(mct_asientocontable.r_fecemi as varchar)::varchar(50) as fecemi";
        strSQL = strSQL + " ,cast(mct_asientocontable.r_fecvcto as varchar)::varchar(50) as fecvcto";
        strSQL = strSQL + " ,cast(mct_asientocontable.r_fecemi_ref as varchar)::varchar(50) as fecemi_ref";
        strSQL = strSQL + " ,cast(mct_asientocontable.fecha_asiento as varchar)::varchar(50) as fecha_asiento";
        strSQL = strSQL + " FROM mct_asientocontable";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND documento_id = $2";
        strSQL = strSQL + " AND periodo = $3";
        strSQL = strSQL + " AND id_libro = $4";
        strSQL = strSQL + " AND num_asiento = $5";
        //console.log(strSQL);

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,periodo,id_libro,num_asiento]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Asiento no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearAsiento = async (req,res,next)=> {
    let strSQL;
    const { //datos cabecera
        id_anfitrion,     //01
        documento_id,     //02
        periodo,          //03
        id_libro,         //04
        //num_asiento,    //numero generado
        glosa,              //05
        debe,               //06
        haber,              //07
        debe_me,            //08
        haber_me,           //09
        mayorizado,         //10
        //ctrl_crea,    // timestamp generado
        ctrl_crea_us,       //11
        r_id_doc,           //12
        r_documento_id,     //13
        r_razon_social,     //14

        r_cod,          //15
        r_serie,        //16
        r_numero,       //17
        r_numero2,      //18
        fecemi,       //19
        fecvcto,      //20

        r_cod_ref,      //21
        r_serie_ref,    //22
        r_numero_ref,   //23
        fecemi_ref,   //24
        
        r_cuenta,       //25
        r_base001,      //26
        r_base002,      //27
        r_base003,      //28
        r_base004,      //29
        r_igv001,       //30
        r_igv002,       //31
        r_igv003,       //32

        r_monto_icbp,   //33
        r_monto_otros,  //34
        r_monto_total,  //35
        r_moneda,       //36        
        r_tc,           //37
        
        r_idbss,        //38
        //datos compras exterior
        r_id_pais,      //39
        r_id_aduana,    //40
        r_ano_dam,      //41
        //datos financiero
        r_id_mediopago,     //42
        r_voucher_banco,    //43
        r_cuenta10,         //44 new efectivo o banco X
        fecha_asiento,       //45 new solo caja y diario servira
        retencion4ta,       //46 new retencion4ta opcional
    } = req.body;

    //cuando llega con dd/mm/yyyy o dd-mm-yyyy hay que invertir el orden, sino sale invalido
    /*
    let datePieces = comprobante_original_fecemi.split("/");
    const fechaArmada = new Date(datePieces[2],datePieces[1],datePieces[0]); //ok con hora 00:00:00
    sSerie = (fechaArmada.getMonth()+1).toString(); // ok, se aumenta +1, por pinche regla js
    sSerie = sSerie.padStart(2,'0');
    */
    //cuidado con edicion manual de la fecha, se registra al reves, pero en caso de click va normal
    //let datePieces = comprobante_original_fecemi.split("-");
    //const fechaArmada = new Date(datePieces[0],datePieces[1],datePieces[2]); //ok con hora 00:00:00

    strSQL = "INSERT INTO mct_asientocontable";
    strSQL +=  " (";
    strSQL += "  id_usuario";   //01
    strSQL += " ,documento_id"; //02
    strSQL += " ,periodo";      //03
    strSQL += " ,id_libro";     //04
    strSQL += " ,num_asiento";  //generado *

    strSQL += " ,glosa";        //05
    strSQL += " ,debe";         //06
    strSQL += " ,haber";        //07
    strSQL += " ,debe_me";      //08
    strSQL += " ,haber_me";     //09
    strSQL += " ,mayorizado";   //10
    strSQL += " ,ctrl_crea";     //generado *
    strSQL += " ,ctrl_crea_us";     //11
    strSQL += " ,r_id_doc";   //12
    strSQL += " ,r_documento_id";   //13
    strSQL += " ,r_razon_social";   //14

    strSQL += " ,r_cod";        //15
    strSQL += " ,r_serie";      //16
    strSQL += " ,r_numero";     //17
    strSQL += " ,r_numero2";    //18
    strSQL += " ,r_fecemi";     //19
    strSQL += " ,r_fecvcto";    //20
    
    strSQL += " ,r_cod_ref";    //21
    strSQL += " ,r_serie_ref";  //22
    strSQL += " ,r_numero_ref"; //23
    strSQL += " ,r_fecemi_ref"; //24
    
    strSQL += " ,r_cuenta";     //25
    strSQL += " ,r_base001";    //26
    strSQL += " ,r_base002";    //27
    strSQL += " ,r_base003";    //28
    strSQL += " ,r_base004";    //29

    strSQL += " ,r_igv001";     //30
    strSQL += " ,r_igv002";     //31
    strSQL += " ,r_igv003";     //32
    
    strSQL += " ,r_monto_icbp";     //33
    strSQL += " ,r_monto_otros";    //34
    strSQL += " ,r_monto_total";    //35
    strSQL += " ,r_moneda";         //36
    strSQL += " ,r_tc";             //37

    strSQL += " ,r_idbss";          //38
    strSQL += " ,r_id_pais";        //39
    strSQL += " ,r_id_aduana";      //40
    strSQL += " ,r_ano_dam";        //41
    
    strSQL += " ,r_id_mediopago";   //42
    strSQL += " ,r_voucher_banco";  //43
    strSQL += " ,r_cuenta10";       //44
    strSQL += " ,origen";       //45 
    strSQL += " ,fecha_asiento";       //46 new
    strSQL += " ,retencion4ta";       //47 new
    strSQL += " )";
    strSQL += " VALUES";
    strSQL += " (";
    strSQL += "  $1";
    strSQL += " ,$2";
    strSQL += " ,$3";
    strSQL += " ,$4";
    //strSQL += " ,(select * from fct_genera_asiento($1,$2,$3,$4))"; //mismo linea con parametros
    strSQL += " ,(select * from fct_genera_asiento('" + id_anfitrion + "','" + documento_id + "','" + periodo + "','" + id_libro + "'))";
    strSQL += " ,$5";
    strSQL += " ,$6";
    strSQL += " ,$7";
    strSQL += " ,$8";
    strSQL += " ,$9";
    strSQL += " ,$10";
    strSQL += " ,CURRENT_TIMESTAMP";
    strSQL += " ,$11";
    strSQL += " ,$12";
    strSQL += " ,$13";
    strSQL += " ,$14"; 
    strSQL += " ,$15";
    strSQL += " ,$16";
    strSQL += " ,$17";
    strSQL += " ,$18";
    strSQL += " ,$19";
    strSQL += " ,$20";
    strSQL += " ,$21";
    strSQL += " ,$22";
    strSQL += " ,$23";
    strSQL += " ,$24";
    strSQL += " ,$25";
    strSQL += " ,$26";
    strSQL += " ,$27";
    strSQL += " ,$28";
    strSQL += " ,$29";
    strSQL += " ,$30";
    strSQL += " ,$31";        
    strSQL += " ,$32";
    strSQL += " ,$33";
    strSQL += " ,$34";
    strSQL += " ,$35";
    strSQL += " ,$36";
    strSQL += " ,$37";
    strSQL += " ,$38";
    strSQL += " ,$39";
    strSQL += " ,$40";
    strSQL += " ,$41";
    strSQL += " ,$42";
    strSQL += " ,$43";
    strSQL += " ,$44";
    strSQL += " ,'MANUAL'";
    strSQL += " ,$45"; //new
    strSQL += " ,$46"; //new ret4ta
    strSQL += " ) RETURNING *";

    try {
        console.log(strSQL);
        const parametros = [   
            id_anfitrion,    //01
            documento_id,    //02
            periodo,         //03
            id_libro,        //04
            devuelveCadenaNull(glosa),          //05
            devuelveNumero(debe),               //06
            devuelveNumero(haber),              //07
            devuelveNumero(debe_me),            //08
            devuelveNumero(haber_me),           //09
            devuelveCadenaNull(mayorizado),     //10

            //devuelveCadenaNull(ctrl_crea_us),    //11
            ctrl_crea_us,    //11
            devuelveCadenaNull(r_id_doc),  //12
            devuelveCadenaNull(r_documento_id),  //13
            devuelveCadenaNull(r_razon_social),  //14

            devuelveCadenaNull(r_cod),           //15
            devuelveCadenaNull(r_serie),         //16
            devuelveCadenaNull(r_numero),        //17
            devuelveCadenaNull(r_numero2),       //18
            devuelveCadenaNull(fecemi),        //19
            devuelveCadenaNull(fecvcto),       //20

            devuelveCadenaNull(r_cod_ref),       //21
            devuelveCadenaNull(r_serie_ref),     //22
            devuelveCadenaNull(r_numero_ref),    //23
            devuelveCadenaNull(fecemi_ref),    //24
            
            devuelveCadenaNull(r_cuenta),        //25
            devuelveCadenaNull(r_base001),       //26
            devuelveCadenaNull(r_base002),       //27
            devuelveCadenaNull(r_base003),       //28
            devuelveCadenaNull(r_base004),       //29
            devuelveCadenaNull(r_igv001),        //30
            devuelveCadenaNull(r_igv002),        //31
            devuelveCadenaNull(r_igv003),        //32
            
            devuelveCadenaNull(r_monto_icbp),    //33
            devuelveCadenaNull(r_monto_otros),   //34
            devuelveCadenaNull(r_monto_total),   //35
            devuelveCadenaNull(r_moneda),        //36
            devuelveCadenaNull(r_tc),            //37

            devuelveCadenaNull(r_idbss),         //38
            devuelveCadenaNull(r_id_pais),       //39
            devuelveCadenaNull(r_id_aduana),     //40
            devuelveCadenaNull(r_ano_dam),       //41
            devuelveCadenaNull(r_id_mediopago),  //42
            devuelveCadenaNull(r_voucher_banco), //43
            devuelveCadenaNull(r_cuenta10),      //44
            devuelveCadenaNull(fecha_asiento),    //45 newww
            devuelveCadenaNull(retencion4ta),    //46 newww
        ];
        console.log(parametros);
        const result = await pool.query(strSQL, parametros);
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const importarExcelRegVentas = async (req, res, next) => {
    let strSQL;
    //cuidado con los json que llegan con archivos adjuntos,se parsea primero    
    const datosCarga = JSON.parse(req.body.datosCarga);
    const {
        id_anfitrion,
        documento_id,
        periodo,
        id_libro,
        id_invitado,
    } = datosCarga;
    
    try {
      const fileBuffer = req.file.buffer;
      //Extraer la extensión del nombre del archivo
      const fileName = req.file.originalname;
      const lastDotIndex = fileName.lastIndexOf('.');
      const fileExtension = lastDotIndex !== -1 ? fileName.slice(lastDotIndex) : '';
      let pos=0;
      console.log('extension: ', fileExtension);
      if (fileExtension==='.xlsx') { pos=0; } //Excel datos propios
      if (fileExtension==='.xls') { pos=4; } //Excel simple csv sire
      //Fin extension, determina inicio de columna

      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
      });
  
      //Seleccion general todas las columnas y eliminamos comas antes de convertirlo  a CSV
      //const csvData = sheetData.map(row => row.map(cell => (cell === '' ? null : cell)).join(',')).join('\n');
      // Seleccion columna x columna de interés (código y nombre con numero columna)
      /*const csvData = sheetData
        .map((row) => [row[0], row[1]].join(','))
        .join('\n');*/

        const csvData = sheetData
        .map((row,index) => [
            index > 0 ? convertirFechaStringComplete(row[pos+0]) : row[pos+0], //A emision
            index > 0 ? convertirFechaStringComplete(row[pos+1]) : row[pos+1], //B vcto
            (row[pos+2] || '').toString().replace(/,/g, ''),    //C cod
            (row[pos+3] || '').toString().replace(/,/g, ''),    //D serie
            (row[pos+4] || '').toString().replace(/,/g, ''),    //E numero
            (row[pos+5] || '').toString().replace(/,/g, ''),    //F numero2
            (row[pos+6] || '').toString().replace(/,/g, ''),    //G tipo
            (row[pos+7] || '').toString().replace(/,/g, ''),    //H documento_id
            (row[pos+8] || '').toString().replace(/,/g, ''),    //I razon social
            
            (corregirMontoNotaCredito(row[pos+9],row[pos+2]) || ''),    //J export
            (corregirMontoNotaCredito(row[pos+10],row[pos+2]) || ''),    //K base
            (corregirMontoNotaCredito(row[pos+11],row[pos+2]) || ''),    //L DESC BASE (NEW)***
            (corregirMontoNotaCredito(row[pos+12],row[pos+2]) || ''),    //M igv
            (corregirMontoNotaCredito(row[pos+13],row[pos+2]) || ''),    //N DESC IGV (NEW)***
            (corregirMontoNotaCredito(row[pos+14],row[pos+2]) || ''),    //O exo
            (corregirMontoNotaCredito(row[pos+15],row[pos+2]) || ''),    //P inafect
            (corregirMontoNotaCredito(row[pos+16],row[pos+2]) || ''),    //Q ISC (NEW)***
            (corregirMontoNotaCredito(row[pos+17],row[pos+2]) || ''),    //R BASE PILADO (NEW)***
            (corregirMontoNotaCredito(row[pos+18],row[pos+2]) || ''),    //S IGV PILADO (NEW)***

            (corregirMontoNotaCredito(row[pos+19],row[pos+2]) || ''),    //T icbp
            (corregirMontoNotaCredito(row[pos+20],row[pos+2]) || ''),    //U otros
            (corregirMontoNotaCredito(row[pos+21],row[pos+2]) || ''),    //V total
            (corregirMontoNotaCredito(row[pos+22],row[pos+2]) || ''),    //W moneda

            (corregirTCPEN(row[pos+23],row[pos+22]) || ''),    //X tc
            index > 0 ? convertirFechaStringComplete(row[pos+24]) : row[pos+24], //Y emision ref
            (row[pos+25] || ''),    //Z cod ref
            (row[pos+26] || ''),    //AA serie ref
            (row[pos+27] || '')    //AB num ref
        ].join(','))
        .join('\n');
        
        //console.log(csvData);

      await pool.query('BEGIN');
  
      // Creamos la tabla temporal solo con las columnas necesarias
      const createTableQuery = `
        DROP TABLE IF EXISTS mct_datos;
        CREATE TEMP TABLE mct_datos (
            r_fecemi DATE,
            r_fecvcto DATE,
            r_cod VARCHAR(2),
            r_serie VARCHAR(5),
            r_numero VARCHAR(22),
            r_numero2 VARCHAR(22),
            r_id_doc VARCHAR(2),
            r_documento_id VARCHAR(20),
            r_razon_social VARCHAR(200),
            r_base001 NUMERIC(14,2),
            r_base002 NUMERIC(14,2),
            r_base_desc NUMERIC(14,2),

            r_igv002 NUMERIC(14,2),
            r_igv_desc NUMERIC(14,2),

            r_base003 NUMERIC(14,2),
            r_base004 NUMERIC(14,2),
            
            r_monto_isc NUMERIC(14,2),            
            r_base_ivap NUMERIC(14,2),
            r_igv_ivap NUMERIC(14,2),

            r_monto_icbp NUMERIC(12,2),
            r_monto_otros NUMERIC(14,2),
            r_monto_total NUMERIC(14,2),
            r_moneda VARCHAR(5),
            r_tc NUMERIC(5,3),
            r_fecemi_ref DATE,
            r_cod_ref VARCHAR(2),
            r_serie_ref VARCHAR(5),
            r_numero_ref VARCHAR(22)
        );
      `;  
            
      await pool.query(createTableQuery);

      /////////////////////////////////////////////////////////////
      //console.log(csvData);
      // Convertimos la cadena CSV a un flujo de lectura
      const csvReadableStream = Readable.from([csvData]);

      // Insertamos los datos desde el CSV a la tabla mct_datos
      //Origen Documentacion https://www.npmjs.com/package/pg-copy-streams
      const client = await pool.connect();
      try {
        const ingestStream = client.query(copyFrom(`COPY mct_datos FROM STDIN WITH CSV HEADER DELIMITER ','`))
        //const sourceStream = fs.createReadStream(csvData)
        //console.log(sourceStream);
        await pipeline(csvReadableStream, ingestStream)
      } finally {
        client.release();
      }
      //await pool.end()

        //////////////////////////////////////////////////////////////
        // Realiza la operación de inserción desde la tabla temporal a mct_venta
        strSQL = "INSERT INTO mct_asientocontable";
        strSQL +=  " (";
        strSQL += "  id_usuario";   //01
        strSQL += " ,documento_id"; //02
        strSQL += " ,periodo";      //03
        strSQL += " ,id_libro";     //04
        strSQL += " ,num_asiento";  //05 generado *
    
        strSQL += " ,glosa";        //06
        strSQL += " ,debe";         //07
        strSQL += " ,haber";        //08
        strSQL += " ,debe_me";      //09
        strSQL += " ,haber_me";     //10
        strSQL += " ,mayorizado";   //11
        strSQL += " ,ctrl_crea";     //12 generado *
        strSQL += " ,ctrl_crea_us";     //13
        strSQL += " ,r_id_doc";         //14
        strSQL += " ,r_documento_id";   //15
        strSQL += " ,r_razon_social";   //16
    
        strSQL += " ,r_cod";        //17
        strSQL += " ,r_serie";      //18
        strSQL += " ,r_numero";     //19
        strSQL += " ,r_numero2";    //20
        strSQL += " ,r_fecemi";     //21
        strSQL += " ,r_fecvcto";    //22
        strSQL += " ,r_cod_ref";    //23
        strSQL += " ,r_serie_ref";  //24
        strSQL += " ,r_numero_ref"; //25
        strSQL += " ,r_fecemi_ref"; //26
        strSQL += " ,r_base001";    //27
        strSQL += " ,r_base002";    //28
        strSQL += " ,r_base003";    //29
        strSQL += " ,r_base004";    //30
        strSQL += " ,r_base_desc";    //28 new        
        strSQL += " ,r_igv002";     //31
        strSQL += " ,r_igv_desc";     //31 new
        
        strSQL += " ,r_monto_isc";     //32 new
        strSQL += " ,r_base_ivap";     //32 new
        strSQL += " ,r_igv_ivap";     //32 new

        strSQL += " ,r_monto_icbp";     //32
        strSQL += " ,r_monto_otros";    //33
        strSQL += " ,r_monto_total";    //34
        strSQL += " ,r_moneda";         //35
        strSQL += " ,r_tc";             //36
        strSQL += " ,origen";             //36
        strSQL += " )";
        strSQL += " SELECT ";
        strSQL += "  $1";             //id_anfitrion
        strSQL += " ,$2";             //documento_id
        strSQL += " ,$3";             //periodo
        strSQL += " ,$4";             //id_libro
        strSQL += " ,fct_genera_asiento($1,$2,$3,$4)"; //num_asiento
        strSQL += " ,'VENTA'";             //glosa
        strSQL += " ,0";             //D
        strSQL += " ,0";             //H
        strSQL += " ,0";             //D $
        strSQL += " ,0";             //H $
        strSQL += " ,'0'";             //MAYORIZADO
        strSQL += " ,CURRENT_TIMESTAMP";       //ctrl_crea
        strSQL += " ,$5";             //id_invitado
        strSQL += " ,r_id_doc";         //excel
        strSQL += " ,r_documento_id";   //excel
        strSQL += " ,r_razon_social";   //excel
    
        strSQL += " ,r_cod";        //excel
        strSQL += " ,r_serie";      //excel
        strSQL += " ,r_numero";     //excel
        strSQL += " ,r_numero2";    //excel
        strSQL += " ,r_fecemi";     //excel
        strSQL += " ,r_fecvcto";    //excel
        strSQL += " ,r_cod_ref";    //excel
        strSQL += " ,r_serie_ref";  //excel
        strSQL += " ,r_numero_ref"; //excel
        strSQL += " ,r_fecemi_ref"; //excel
        strSQL += " ,r_base001";    //excel
        strSQL += " ,r_base002";    //excel
        strSQL += " ,r_base003";    //excel
        strSQL += " ,r_base004";    //excel
        strSQL += " ,r_base_desc";    //28 new        
        strSQL += " ,r_igv002";     //excel
        strSQL += " ,r_igv_desc";     //31 new  

        strSQL += " ,r_monto_isc";     //32 new
        strSQL += " ,r_base_ivap";     //32 new
        strSQL += " ,r_igv_ivap";     //32 new
        
        strSQL += " ,r_monto_icbp";     //excel
        strSQL += " ,r_monto_otros";    //excel
        strSQL += " ,r_monto_total";    //excel
        strSQL += " ,r_moneda";         //excel
        strSQL += " ,r_tc";             //excel
        if (fileExtension==='.xls') { 
            strSQL += " ,'SIRE'";          //origen
        } //Sire CSV Excel
        if (fileExtension==='.xlsx') {
            strSQL += " ,'EXCEL'";          //origen
        } //Excel datos propios
        strSQL += " FROM mct_datos";    
        const parametros = [   
            id_anfitrion,    //01
            documento_id,    //02
            periodo,         //03
            id_libro,        //04
            id_invitado,     //05        
        ];
            
        //console.log(strSQL);
        //console.log('parametros arreglo:',parametros);
        await pool.query(strSQL, parametros);

      await client.query(`DROP TABLE mct_datos`);
      await pool.query('COMMIT');
      /////////////////////////////////////////////////////////////
      //console.log("final");
      res.status(200).json({ mensaje: 'Hoja Excel insertado correctamente en base de datos' });
    } catch (error) {
      console.log(error);
      await pool.query('ROLLBACK');
      next(error);
    }
};
  
const importarExcelRegCompras = async (req, res, next) => {
    let strSQL;
    //cuidado con los json que llegan con archivos adjuntos,se parsea primero    
    const datosCarga = JSON.parse(req.body.datosCarga);
    const {
        id_anfitrion,
        documento_id,
        periodo,
        id_libro,
        id_invitado,
    } = datosCarga;
    
    try {
      const fileBuffer = req.file.buffer;
      //Extraer la extensión del nombre del archivo
      const fileName = req.file.originalname;
      const lastDotIndex = fileName.lastIndexOf('.');
      const fileExtension = lastDotIndex !== -1 ? fileName.slice(lastDotIndex) : '';
      let pos=0;
      if (fileExtension==='.xlsx') { pos=0; } //Excel datos propios
      if (fileExtension==='.xls') { pos=4; } //Excel simple csv sire
      //Fin extension, determina inicio de columna

      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
      });
  
      //Seleccion general todas las columnas y eliminamos comas antes de convertirlo  a CSV
      //const csvData = sheetData.map(row => row.map(cell => (cell === '' ? null : cell)).join(',')).join('\n');
      // Seleccion columna x columna de interés (código y nombre con numero columna)
      /*const csvData = sheetData
        .map((row) => [row[0], row[1]].join(','))
        .join('\n');*/

        const csvData = sheetData
        .map((row,index) => [
            index > 0 ? convertirFechaStringComplete(row[pos+0]) : row[pos+0], //A emision
            index > 0 ? convertirFechaStringComplete(row[pos+1]) : row[pos+1], //B vcto
            (row[pos+2] || '').toString().replace(/,/g, ''),    //C cod
            (row[pos+3] || '').toString().replace(/,/g, ''),    //D serie
            (row[pos+4] || '').toString().replace(/,/g, ''),    //E ano dua
            (row[pos+5] || '').toString().replace(/,/g, ''),    //F numero
            (row[pos+6] || '').toString().replace(/,/g, ''),    //G numero2
            (row[pos+7] || '').toString().replace(/,/g, ''),    //H tipo
            (row[pos+8] || '').toString().replace(/,/g, ''),    //I documento_id
            (row[pos+9] || '').toString().replace(/,/g, ''),    //J razon social

            (row[pos+10] || ''),    //K BASE001
            (row[pos+11] || ''),    //L igv001
            (row[pos+12] || ''),    //M base002
            (row[pos+13] || ''),    //N igv002
            (row[pos+14] || ''),    //O base003
            (row[pos+15] || ''),    //P igv003
            (row[pos+16] || ''),    //Q nograv
            (row[pos+17] || ''),    //R isc
            (row[pos+18] || ''),    //S icbp
            (row[pos+19] || ''),    //T otros
            (row[pos+20] || ''),    //U total
            (row[pos+21] || ''),    //V moneda
            (corregirTCPEN(row[pos+22],row[pos+21]) || ''),    //W tc
            index > 0 ? convertirFechaStringComplete(row[pos+23]) : row[pos+23], //X emision ref
            (row[pos+24] || ''),    //Y cod ref
            (row[pos+25] || ''),    //Z serie ref
            (row[pos+26] || ''),    //AA cod aduana
            (row[pos+27] || ''),    //AB numero ref
            (row[pos+28] || ''),    //AC id_bss
            (row[pos+29] || '')    //AD NEW retencion4ta  *******
        ].join(','))
        .join('\n');
        //console.log(csvData);

      await pool.query('BEGIN');
  
      // Creamos la tabla temporal solo con las columnas necesarias
      const createTableQuery = `
        DROP TABLE IF EXISTS mct_datos;
        CREATE TEMP TABLE mct_datos (
            r_fecemi DATE,
            r_fecvcto DATE,
            r_cod VARCHAR(2),
            r_serie VARCHAR(5),
            r_ano_dam VARCHAR(5),
            r_numero VARCHAR(22),
            r_numero2 VARCHAR(22),
            r_id_doc VARCHAR(2),
            r_documento_id VARCHAR(20),
            r_razon_social VARCHAR(200),
            r_base001 NUMERIC(14,2),
            r_igv001 NUMERIC(14,2),
            r_base002 NUMERIC(14,2),
            r_igv002 NUMERIC(14,2),
            r_base003 NUMERIC(14,2),
            r_igv003 NUMERIC(14,2),
            r_base004 NUMERIC(14,2),
            r_monto_isc NUMERIC(14,2),
            r_monto_icbp NUMERIC(14,2),
            r_monto_otros NUMERIC(14,2),
            r_monto_total NUMERIC(14,2),
            r_moneda VARCHAR(5),
            r_tc NUMERIC(5,3),
            r_fecemi_ref DATE,
            r_cod_ref VARCHAR(2),
            r_serie_ref VARCHAR(5),
            r_id_aduana VARCHAR(5),
            r_numero_ref VARCHAR(22),
            r_idbss VARCHAR(5),
            retencion4ta NUMERIC(14,2)
        );
      `;  
      await pool.query(createTableQuery);

      /////////////////////////////////////////////////////////////
      //console.log(csvData);
      // Convertimos la cadena CSV a un flujo de lectura
      const csvReadableStream = Readable.from([csvData]);

      // Insertamos los datos desde el CSV a la tabla mct_datos
      //Origen Documentacion https://www.npmjs.com/package/pg-copy-streams
      const client = await pool.connect();
      try {
        const ingestStream = client.query(copyFrom(`COPY mct_datos FROM STDIN WITH CSV HEADER DELIMITER ','`))
        //const sourceStream = fs.createReadStream(csvData)
        //console.log(sourceStream);
        await pipeline(csvReadableStream, ingestStream)
      } finally {
        client.release();
      }
      //await pool.end()

        //////////////////////////////////////////////////////////////
        // Realiza la operación de inserción desde la tabla temporal a mct_venta
        strSQL = "INSERT INTO mct_asientocontable";
        strSQL +=  " (";
        strSQL += "  id_usuario";   //01
        strSQL += " ,documento_id"; //02
        strSQL += " ,periodo";      //03
        strSQL += " ,id_libro";     //04
        strSQL += " ,num_asiento";  //05 generado *
    
        strSQL += " ,glosa";        //06
        strSQL += " ,debe";         //07
        strSQL += " ,haber";        //08
        strSQL += " ,debe_me";      //09
        strSQL += " ,haber_me";     //10
        strSQL += " ,mayorizado";   //11
        strSQL += " ,ctrl_crea";     //12 generado *
        strSQL += " ,ctrl_crea_us";     //13
        strSQL += " ,r_id_doc";         //14
        strSQL += " ,r_documento_id";   //15
        strSQL += " ,r_razon_social";   //16
    
        strSQL += " ,r_cod";        //17
        strSQL += " ,r_serie";      //18
        strSQL += " ,r_numero";     //19
        strSQL += " ,r_ano_dam";    //20
        strSQL += " ,r_numero2";    //21
        strSQL += " ,r_fecemi";     //22
        strSQL += " ,r_fecvcto";    //23
        
        strSQL += " ,r_cod_ref";    //24
        strSQL += " ,r_serie_ref";  //25
        strSQL += " ,r_numero_ref"; //26
        strSQL += " ,r_fecemi_ref"; //27
        
        strSQL += " ,r_base001";    //28
        strSQL += " ,r_base002";    //29
        strSQL += " ,r_base003";    //30
        strSQL += " ,r_base004";    //31
        strSQL += " ,r_igv001";     //32
        strSQL += " ,r_igv002";     //33
        strSQL += " ,r_igv003";     //34
        strSQL += " ,r_monto_isc";     //35
        strSQL += " ,r_monto_icbp";     //36
        strSQL += " ,r_monto_otros";    //37
        strSQL += " ,r_monto_total";    //38
        strSQL += " ,r_moneda";         //39
        strSQL += " ,r_tc";             //40
        strSQL += " ,r_id_aduana";      //41
        strSQL += " ,r_idbss";          //42
        strSQL += " ,origen";           //43
        strSQL += " ,retencion4ta";           //43
        strSQL += " )";
        strSQL += " SELECT ";
        strSQL += "  $1";             //01 id_anfitrion
        strSQL += " ,$2";             //02 documento_id
        strSQL += " ,$3";             //03 periodo
        strSQL += " ,$4";             //04 id_libro
        strSQL += " ,fct_genera_asiento($1,$2,$3,$4)"; //05 num_asiento
        strSQL += " ,'COMPRA'";          //06 glosa
        strSQL += " ,0";                //07 D
        strSQL += " ,0";                //08 H
        strSQL += " ,0";                //09 D $
        strSQL += " ,0";                //10 H $
        strSQL += " ,'0'";              //11 MAYORIZADO
        strSQL += " ,CURRENT_TIMESTAMP"; //12 ctrl_crea
        strSQL += " ,$5";                //13 id_invitado
        strSQL += " ,r_id_doc";          //14 excel
        strSQL += " ,r_documento_id";    //15 excel
        strSQL += " ,r_razon_social";    //16 excel
    
        strSQL += " ,r_cod";        //17 excel
        strSQL += " ,r_serie";      //18 excel
        strSQL += " ,r_numero";     //19 excel
        strSQL += " ,r_ano_dam";    //20 excel
        strSQL += " ,r_numero2";    //21 excel
        strSQL += " ,r_fecemi";     //22 excel
        strSQL += " ,r_fecvcto";    //23 excel
        
        strSQL += " ,r_cod_ref";    //24 excel
        strSQL += " ,r_serie_ref";  //25 excel
        strSQL += " ,r_numero_ref"; //26 excel
        strSQL += " ,r_fecemi_ref"; //27 excel
        
        strSQL += " ,r_base001";    //28 excel
        strSQL += " ,r_base002";    //29 excel
        strSQL += " ,r_base003";    //30 excel
        strSQL += " ,r_base004";    //31 excel
        strSQL += " ,r_igv001";     //32 excel
        strSQL += " ,r_igv002";     //33 excel
        strSQL += " ,r_igv003";     //34 excel
        strSQL += " ,r_monto_isc";     //35 excel
        strSQL += " ,r_monto_icbp";     //36 excel
        strSQL += " ,r_monto_otros";    //37 excel
        strSQL += " ,r_monto_total";    //38 excel
        strSQL += " ,r_moneda";         //39 excel
        strSQL += " ,r_tc";             //40 excel
        strSQL += " ,r_id_aduana";      //41 excel
        strSQL += " ,r_idbss";          //42 excel
        if (fileExtension==='.xls') { 
            strSQL += " ,'SIRE'";          //origen
        } //Sire CSV Excel
        if (fileExtension==='.xlsx') {
            strSQL += " ,'EXCEL'";          //origen
        } //Excel datos propios
        strSQL += " ,retencion4ta";          //43 excel new

        strSQL += " FROM mct_datos";
        const parametros = [   
            id_anfitrion,    //01
            documento_id,    //02
            periodo,         //03
            id_libro,        //04
            id_invitado,     //05        
        ];
            
        //console.log(strSQL);
        //console.log('parametros arreglo:',parametros);
        await pool.query(strSQL, parametros);
      
      await client.query(`DROP TABLE mct_datos`);
      await pool.query('COMMIT');
      /////////////////////////////////////////////////////////////
      //console.log("final");
      res.status(200).json({ mensaje: 'Hoja Excel insertado correctamente en base de datos' });
    } catch (error) {
      console.log(error);
      await pool.query('ROLLBACK');
      next(error);
    }
};

const importarSireRegVentas = async (req, res, next) => {
    let strSQL;
    //cuidado con los json que llegan con archivos adjuntos,se parsea primero    
    const datosCarga = JSON.parse(req.body.datosCarga);
    const {
        id_anfitrion,
        documento_id,
        periodo,
        id_libro,
        id_invitado,
    } = datosCarga;
    
    try {
      const fileBuffer = req.file.buffer;
      //const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      //const sheetName = workbook.SheetNames[0];
      //const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      //  header: 1,
      //});
      const fileData = fileBuffer.toString('utf-8'); // Convertir buffer a cadena
      const lines = fileData.split('\n').filter(line => line.trim() !== '' || line === '\r'); // Excluir líneas vacías pero permitir un retorno de carro al final
    
      const csvData = lines
      .map((line, index) => {
          const row = line.split('|');
          return [
              index > 0 ? convertirFechaStringComplete(row[4]) : row[4], //A emision
              index > 0 ? convertirFechaStringComplete(row[5]) : row[5], //B vcto
              (row[6] || '').toString().replace(/,/g, ''), //C cod
              (row[7] || '').toString().replace(/,/g, ''), //D serie
              (row[8] || '').toString().replace(/,/g, ''), //E numero
              (row[9] || '').toString().replace(/,/g, ''), //F numero2
              (row[10] || '').toString().replace(/,/g, ''), //G tipo
              (row[11] || '').toString().replace(/,/g, ''), //H documento_id
              (row[12] || '').toString().replace(/,/g, ''), //I razon social
              (row[13] || ''), //J export
              (row[14] || ''), //K base
              (row[15] || ''), //L base desc    NEW
              (row[16] || ''), //M igv
              (row[17] || ''), //N igv desc     NEW
              (row[18] || ''), //O exo
              (row[19] || ''), //P inafect
              (row[20] || ''), //Q isc          NEW
              (row[21] || ''), //R base ivap    NEW
              (row[22] || ''), //S ivap         NEW
                
              (row[23] || ''), //T icbp
              (row[24] || ''), //U otros
              (row[25] || ''), //V total
              (row[26] || ''), //W moneda
              (row[27] || ''), //X tc
              index > 0 ? convertirFechaStringComplete(row[28]) : row[28], //Y emision ref
              (row[29] || ''), //Z cod ref
              (row[30] || ''), //AA serie ref
              (row[31] || '') //AB num ref
                /*
              index > 0 ? convertirFechaStringComplete(row[0]) : row[0], //A emision
              index > 0 ? convertirFechaStringComplete(row[1]) : row[1], //B vcto
              (row[2] || '').toString().replace(/,/g, ''), //C cod
              (row[3] || '').toString().replace(/,/g, ''), //D serie
              (row[4] || '').toString().replace(/,/g, ''), //E numero
              (row[5] || '').toString().replace(/,/g, ''), //F numero2
              (row[6] || '').toString().replace(/,/g, ''), //G tipo
              (row[7] || '').toString().replace(/,/g, ''), //H documento_id
              (row[8] || '').toString().replace(/,/g, ''), //I razon social
              (row[9] || ''), //J export
              (row[10] || ''), //K base
              (row[11] || ''), //L base desc    NEW
              (row[12] || ''), //M igv
              (row[13] || ''), //N igv desc     NEW
              (row[14] || ''), //O exo
              (row[15] || ''), //P inafect
              (row[16] || ''), //Q isc          NEW
              (row[17] || ''), //R base ivap    NEW
              (row[18] || ''), //S ivap         NEW
                
              (row[19] || ''), //T icbp
              (row[20] || ''), //U otros
              (row[21] || ''), //V total
              (row[22] || ''), //W moneda
              (row[23] || ''), //X tc
              index > 0 ? convertirFechaStringComplete(row[24]) : row[24], //Y emision ref
              (row[25] || ''), //Z cod ref
              (row[26] || ''), //AA serie ref
              (row[27] || '') //AB num ref */

          ].join(',');
      })
      .join('\n');

        console.log(csvData);

      await pool.query('BEGIN');
  
      // Creamos la tabla temporal solo con las columnas necesarias
      const createTableQuery = `
        DROP TABLE IF EXISTS mct_datos;
        CREATE TEMP TABLE mct_datos (
            r_fecemi DATE,
            r_fecvcto DATE,
            r_cod VARCHAR(2),
            r_serie VARCHAR(5),
            r_numero VARCHAR(22),
            r_numero2 VARCHAR(22),
            r_id_doc VARCHAR(2),
            r_documento_id VARCHAR(20),
            r_razon_social VARCHAR(200),

            r_base001 NUMERIC(14,2),
            r_base002 NUMERIC(14,2),
            r_base_desc NUMERIC(14,2), 

            r_igv002 NUMERIC(14,2),
            r_igv_desc NUMERIC(14,2), 

            r_base003 NUMERIC(14,2),
            r_base004 NUMERIC(14,2),

            r_monto_isc NUMERIC(12,2),
            r_base_ivap NUMERIC(12,2),
            r_igv_ivap NUMERIC(12,2),

            r_monto_icbp NUMERIC(12,2),
            r_monto_otros NUMERIC(14,2),
            r_monto_total NUMERIC(14,2),
            r_moneda VARCHAR(5),
            r_tc NUMERIC(5,3),
            r_fecemi_ref DATE,
            r_cod_ref VARCHAR(2),
            r_serie_ref VARCHAR(5),
            r_numero_ref VARCHAR(22)
        );
      `;  
            
      await pool.query(createTableQuery);

      /////////////////////////////////////////////////////////////
      //console.log(csvData);
      // Convertimos la cadena CSV a un flujo de lectura
      const csvReadableStream = Readable.from([csvData]);

      // Insertamos los datos desde el CSV a la tabla mct_datos
      //Origen Documentacion https://www.npmjs.com/package/pg-copy-streams
      const client = await pool.connect();
      try {
        const ingestStream = client.query(copyFrom(`COPY mct_datos FROM STDIN WITH CSV HEADER DELIMITER ','`))
        //const sourceStream = fs.createReadStream(csvData)
        //console.log(sourceStream);
        await pipeline(csvReadableStream, ingestStream)
      } finally {
        client.release();
      }
      //await pool.end()

        //////////////////////////////////////////////////////////////
        // Realiza la operación de inserción desde la tabla temporal a mct_venta
        strSQL = "INSERT INTO mct_asientocontable";
        strSQL +=  " (";
        strSQL += "  id_usuario";   //01
        strSQL += " ,documento_id"; //02
        strSQL += " ,periodo";      //03
        strSQL += " ,id_libro";     //04
        strSQL += " ,num_asiento";  //05 generado *
    
        strSQL += " ,glosa";        //06
        strSQL += " ,debe";         //07
        strSQL += " ,haber";        //08
        strSQL += " ,debe_me";      //09
        strSQL += " ,haber_me";     //10
        strSQL += " ,mayorizado";   //11
        strSQL += " ,ctrl_crea";     //12 generado *
        strSQL += " ,ctrl_crea_us";     //13
        strSQL += " ,r_id_doc";         //14
        strSQL += " ,r_documento_id";   //15
        strSQL += " ,r_razon_social";   //16
    
        strSQL += " ,r_cod";        //17
        strSQL += " ,r_serie";      //18
        strSQL += " ,r_numero";     //19
        strSQL += " ,r_numero2";    //20
        strSQL += " ,r_fecemi";     //21
        strSQL += " ,r_fecvcto";    //22
        
        strSQL += " ,r_cod_ref";    //23
        strSQL += " ,r_serie_ref";  //24
        strSQL += " ,r_numero_ref"; //25
        strSQL += " ,r_fecemi_ref"; //26
        
        strSQL += " ,r_base001";    //27
        strSQL += " ,r_base002";    //28
        strSQL += " ,r_base_desc";    //28 new

        strSQL += " ,r_base003";    //29
        strSQL += " ,r_base004";    //30
        strSQL += " ,r_igv002";     //31
        strSQL += " ,r_igv_desc";     //31 new

        strSQL += " ,r_monto_isc";     //31 new
        strSQL += " ,r_base_ivap";     //31 new
        strSQL += " ,r_igv_ivap";     //31 new

        strSQL += " ,r_monto_icbp";     //32
        strSQL += " ,r_monto_otros";    //33
        strSQL += " ,r_monto_total";    //34
        strSQL += " ,r_moneda";         //35
        strSQL += " ,r_tc";             //36
        strSQL += " ,origen";             //36
        strSQL += " )";
        strSQL += " SELECT ";
        strSQL += "  $1";             //id_anfitrion
        strSQL += " ,$2";             //documento_id
        strSQL += " ,$3";             //periodo
        strSQL += " ,$4";             //id_libro
        strSQL += " ,fct_genera_asiento($1,$2,$3,$4)"; //num_asiento
        strSQL += " ,'VENTA'";             //glosa
        strSQL += " ,0";             //D
        strSQL += " ,0";             //H
        strSQL += " ,0";             //D $
        strSQL += " ,0";             //H $
        strSQL += " ,'0'";             //MAYORIZADO
        strSQL += " ,CURRENT_TIMESTAMP";       //ctrl_crea
        strSQL += " ,$5";             //id_invitado
        strSQL += " ,r_id_doc";         //excel
        strSQL += " ,r_documento_id";   //excel
        strSQL += " ,r_razon_social";   //excel
    
        strSQL += " ,r_cod";        //excel
        strSQL += " ,r_serie";      //excel
        strSQL += " ,r_numero";     //excel
        strSQL += " ,r_numero2";    //excel
        strSQL += " ,r_fecemi";     //excel
        strSQL += " ,r_fecvcto";    //excel
        
        strSQL += " ,r_cod_ref";    //excel
        strSQL += " ,r_serie_ref";  //excel
        strSQL += " ,r_numero_ref"; //excel
        strSQL += " ,r_fecemi_ref"; //excel
        
        strSQL += " ,r_base001";    //excel
        strSQL += " ,r_base002";    //excel
        strSQL += " ,r_base_desc";    // new
        
        strSQL += " ,r_base003";    //excel
        strSQL += " ,r_base004";    //excel
        strSQL += " ,r_igv002";     //excel
        strSQL += " ,r_igv_desc";     // new

        strSQL += " ,r_monto_isc";     // new
        strSQL += " ,r_base_ivap";     // new
        strSQL += " ,r_igv_ivap";     // new

        strSQL += " ,r_monto_icbp";     //excel
        strSQL += " ,r_monto_otros";    //excel
        strSQL += " ,r_monto_total";    //excel
        strSQL += " ,r_moneda";         //excel
        strSQL += " ,r_tc";             //excel
        strSQL += " ,'SIRE'";             //origen
        strSQL += " FROM mct_datos";             //37
        const parametros = [   
            id_anfitrion,    //01
            documento_id,    //02
            periodo,         //03
            id_libro,        //04
            id_invitado,     //05        
        ];
            
        //console.log(strSQL);
        //console.log('parametros arreglo:',parametros);
        await pool.query(strSQL, parametros);

      await client.query(`DROP TABLE mct_datos`);
      await pool.query('COMMIT');
      /////////////////////////////////////////////////////////////
      //console.log("final");
      res.status(200).json({ mensaje: 'Hoja Excel insertado correctamente en base de datos' });
    } catch (error) {
      console.log(error);
      await pool.query('ROLLBACK');
      next(error);
    }
};

const importarSireRegCompras = async (req, res, next) => {
    let strSQL;
    //cuidado con los json que llegan con archivos adjuntos,se parsea primero    
    const datosCarga = JSON.parse(req.body.datosCarga);
    const {
        id_anfitrion,
        documento_id,
        periodo,
        id_libro,
        id_invitado,
    } = datosCarga;
    
    try {
      const fileBuffer = req.file.buffer;
      const fileData = fileBuffer.toString('utf-8'); // Convertir buffer a cadena
      //const lines = fileData.split('\n');
      const lines = fileData.split('\n').filter(line => line.trim() !== '' || line === '\r'); // Excluir líneas vacías pero permitir un retorno de carro al final
    
      const csvData = lines
      .map((line, index) => {
          const row = line.split('|');
          return [
                index > 0 ? convertirFechaStringComplete(row[4]) : row[4], //A emision
                index > 0 ? convertirFechaStringComplete(row[5]) : row[5], //B vcto
                (row[6] || '').toString().replace(/,/g, ''),    //C cod
                (row[7] || '').toString().replace(/,/g, ''),    //D serie
                (row[8] || '').toString().replace(/,/g, ''),    //E ano dua
                (row[9] || '').toString().replace(/,/g, ''),    //F numero
                (row[10] || '').toString().replace(/,/g, ''),    //G numero2
                (row[11] || '').toString().replace(/,/g, ''),    //H tipo
                (row[12] || '').toString().replace(/,/g, ''),    //I documento_id
                (row[13] || '').toString().replace(/,/g, ''),    //J razon social

                (row[14] || ''),    //K BASE001
                (row[15] || ''),    //L igv001
                (row[16] || ''),    //M base002
                (row[17] || ''),    //N igv002
                (row[18] || ''),    //O base003
                (row[19] || ''),    //P igv003
                (row[20] || ''),    //Q nograv
                (row[21] || ''),    //R isc
                (row[22] || ''),    //S icbp
                (row[23] || ''),    //T otros
                (row[24] || ''),    //U total
                (row[25] || ''),    //V moneda
                (row[26] || ''),    //W tc
                index > 0 ? convertirFechaStringComplete(row[27]) : row[27], //X emision ref
                (row[28] || ''),    //Y cod ref
                (row[29] || ''),    //Z serie ref
                (row[30] || ''),    //AA cod aduana
                (row[31] || ''),    //AB numero ref
                (row[32] || '')    //AC id_bss
          ].join(',');
      })
      .join('\n');

      console.log(csvData);

      await pool.query('BEGIN');
  
      // Creamos la tabla temporal solo con las columnas necesarias
      const createTableQuery = `
        DROP TABLE IF EXISTS mct_datos;
        CREATE TEMP TABLE mct_datos (
            r_fecemi DATE,
            r_fecvcto DATE,
            r_cod VARCHAR(2),
            r_serie VARCHAR(5),
            r_ano_dam VARCHAR(5),
            r_numero VARCHAR(22),
            r_numero2 VARCHAR(22),
            r_id_doc VARCHAR(2),
            r_documento_id VARCHAR(20),
            r_razon_social VARCHAR(200),
            r_base001 NUMERIC(14,2),
            r_igv001 NUMERIC(14,2),
            r_base002 NUMERIC(14,2),
            r_igv002 NUMERIC(14,2),
            r_base003 NUMERIC(14,2),
            r_igv003 NUMERIC(14,2),
            r_base004 NUMERIC(14,2),
            r_monto_isc NUMERIC(14,2),
            r_monto_icbp NUMERIC(14,2),
            r_monto_otros NUMERIC(14,2),
            r_monto_total NUMERIC(14,2),
            r_moneda VARCHAR(5),
            r_tc NUMERIC(5,3),
            r_fecemi_ref DATE,
            r_cod_ref VARCHAR(2),
            r_serie_ref VARCHAR(5),
            r_id_aduana VARCHAR(5),
            r_numero_ref VARCHAR(22),
            r_idbss VARCHAR(5)
        );
      `;  
      await pool.query(createTableQuery);

      /////////////////////////////////////////////////////////////
      //console.log(csvData);
      // Convertimos la cadena CSV a un flujo de lectura
      const csvReadableStream = Readable.from([csvData]);

      // Insertamos los datos desde el CSV a la tabla mct_datos
      //Origen Documentacion https://www.npmjs.com/package/pg-copy-streams
      const client = await pool.connect();
      try {
        const ingestStream = client.query(copyFrom(`COPY mct_datos FROM STDIN WITH CSV HEADER DELIMITER ','`))
        //const sourceStream = fs.createReadStream(csvData)
        //console.log(sourceStream);
        await pipeline(csvReadableStream, ingestStream)
      } finally {
        client.release();
      }
      //await pool.end()

        //////////////////////////////////////////////////////////////
        // Realiza la operación de inserción desde la tabla temporal a mct_venta
        strSQL = "INSERT INTO mct_asientocontable";
        strSQL +=  " (";
        strSQL += "  id_usuario";   //01
        strSQL += " ,documento_id"; //02
        strSQL += " ,periodo";      //03
        strSQL += " ,id_libro";     //04
        strSQL += " ,num_asiento";  //05 generado *
    
        strSQL += " ,glosa";        //06
        strSQL += " ,debe";         //07
        strSQL += " ,haber";        //08
        strSQL += " ,debe_me";      //09
        strSQL += " ,haber_me";     //10
        strSQL += " ,mayorizado";   //11
        strSQL += " ,ctrl_crea";     //12 generado *
        strSQL += " ,ctrl_crea_us";     //13
        strSQL += " ,r_id_doc";         //14
        strSQL += " ,r_documento_id";   //15
        strSQL += " ,r_razon_social";   //16
    
        strSQL += " ,r_cod";        //17
        strSQL += " ,r_serie";      //18
        strSQL += " ,r_numero";     //19
        strSQL += " ,r_ano_dam";    //20
        strSQL += " ,r_numero2";    //21
        strSQL += " ,r_fecemi";     //22
        strSQL += " ,r_fecvcto";    //23
        
        strSQL += " ,r_cod_ref";    //24
        strSQL += " ,r_serie_ref";  //25
        strSQL += " ,r_numero_ref"; //26
        strSQL += " ,r_fecemi_ref"; //27
        
        strSQL += " ,r_base001";    //28
        strSQL += " ,r_base002";    //29
        strSQL += " ,r_base003";    //30
        strSQL += " ,r_base004";    //31
        strSQL += " ,r_igv001";     //32
        strSQL += " ,r_igv002";     //33
        strSQL += " ,r_igv003";     //34
        strSQL += " ,r_monto_isc";     //35
        strSQL += " ,r_monto_icbp";     //36
        strSQL += " ,r_monto_otros";    //37
        strSQL += " ,r_monto_total";    //38
        strSQL += " ,r_moneda";         //39
        strSQL += " ,r_tc";             //40
        strSQL += " ,r_id_aduana";      //41
        strSQL += " ,r_idbss";          //42
        strSQL += " ,origen";           //43
        strSQL += " )";
        strSQL += " SELECT ";
        strSQL += "  $1";             //01 id_anfitrion
        strSQL += " ,$2";             //02 documento_id
        strSQL += " ,$3";             //03 periodo
        strSQL += " ,$4";             //04 id_libro
        strSQL += " ,fct_genera_asiento($1,$2,$3,$4)"; //05 num_asiento
        strSQL += " ,'COMPRA'";          //06 glosa
        strSQL += " ,0";                //07 D
        strSQL += " ,0";                //08 H
        strSQL += " ,0";                //09 D $
        strSQL += " ,0";                //10 H $
        strSQL += " ,'0'";              //11 MAYORIZADO
        strSQL += " ,CURRENT_TIMESTAMP"; //12 ctrl_crea
        strSQL += " ,$5";                //13 id_invitado
        strSQL += " ,r_id_doc";          //14 excel
        strSQL += " ,r_documento_id";    //15 excel
        strSQL += " ,r_razon_social";    //16 excel
    
        strSQL += " ,r_cod";        //17 excel
        strSQL += " ,r_serie";      //18 excel
        strSQL += " ,r_numero";     //19 excel
        strSQL += " ,r_ano_dam";    //20 excel
        strSQL += " ,r_numero2";    //21 excel
        strSQL += " ,r_fecemi";     //22 excel
        strSQL += " ,r_fecvcto";    //23 excel
        
        strSQL += " ,r_cod_ref";    //24 excel
        strSQL += " ,r_serie_ref";  //25 excel
        strSQL += " ,r_numero_ref"; //26 excel
        strSQL += " ,r_fecemi_ref"; //27 excel
        
        strSQL += " ,r_base001";    //28 excel
        strSQL += " ,r_base002";    //29 excel
        strSQL += " ,r_base003";    //30 excel
        strSQL += " ,r_base004";    //31 excel
        strSQL += " ,r_igv001";     //32 excel
        strSQL += " ,r_igv002";     //33 excel
        strSQL += " ,r_igv003";     //34 excel
        strSQL += " ,r_monto_isc";     //35 excel
        strSQL += " ,r_monto_icbp";     //36 excel
        strSQL += " ,r_monto_otros";    //37 excel
        strSQL += " ,r_monto_total";    //38 excel
        strSQL += " ,r_moneda";         //39 excel
        strSQL += " ,r_tc";             //40 excel
        strSQL += " ,r_id_aduana";      //41 excel
        strSQL += " ,r_idbss";          //42 excel
        strSQL += " ,'SIRE'";          //43 origen
        strSQL += " FROM mct_datos";
        const parametros = [   
            id_anfitrion,    //01
            documento_id,    //02
            periodo,         //03
            id_libro,        //04
            id_invitado,     //05        
        ];
            
        //console.log(strSQL);
        //console.log('parametros arreglo:',parametros);
        await pool.query(strSQL, parametros);
      
      await client.query(`DROP TABLE mct_datos`);
      await pool.query('COMMIT');
      /////////////////////////////////////////////////////////////
      //console.log("final");
      res.status(200).json({ mensaje: 'Archivo SIRE insertado correctamente en base de datos' });
    } catch (error) {
      console.log(error);
      await pool.query('ROLLBACK');
      next(error);
    }
};

const eliminarAsiento = async (req,res,next)=> {
    try {
        const {id_anfitrion, documento_id, periodo, id_libro, num_asiento} = req.params;
        var strSQL;
        var result;
        var result2;
        
        //primero eliminar todos detalles
        strSQL = "DELETE FROM mct_asientocontabledet ";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND documento_id = $2";
        strSQL = strSQL + " AND periodo = $3";
        strSQL = strSQL + " AND id_libro = $4";
        strSQL = strSQL + " AND num_asiento = $5";
        console.log(strSQL);
        console.log([id_anfitrion,documento_id,periodo,id_libro,num_asiento]);

        result = await pool.query(strSQL,[id_anfitrion,documento_id,periodo,id_libro,num_asiento]);
        /*if (result.rowCount === 0)
            return res.status(404).json({
                message:"Detalle no encontrado"
            });*/

        //luego eliminar cabecera
        strSQL = "DELETE FROM mct_asientocontable ";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND documento_id = $2";
        strSQL = strSQL + " AND periodo = $3";
        strSQL = strSQL + " AND id_libro = $4";
        strSQL = strSQL + " AND num_asiento = $5";
        console.log(strSQL);
        console.log([id_anfitrion,documento_id,periodo,id_libro,num_asiento]);
        result2 = await pool.query(strSQL,[id_anfitrion,documento_id,periodo,id_libro,num_asiento]);
        if (result2.rowCount === 0)
            return res.status(404).json({
                message:"ASiento no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};
const eliminarAsientoOrigen = async (req,res,next)=> {
    try {
        const {id_anfitrion, documento_id, periodo, id_libro, origen} = req.params;
        var strSQL;
        var result;
        var result2;
        
        //primero eliminar todos detalles
        strSQL = "DELETE FROM mct_asientocontabledet ";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND documento_id = $2";
        strSQL = strSQL + " AND periodo = $3";
        strSQL = strSQL + " AND id_libro = $4";
        strSQL = strSQL + " AND origen = $5";

        result = await pool.query(strSQL,[id_anfitrion,documento_id,periodo,id_libro,origen]);
        /*if (result.rowCount === 0)
            return res.status(404).json({
                message:"Detalle no encontrado"
            });
*/
        //luego eliminar cabecera
        strSQL = "DELETE FROM mct_asientocontable ";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND documento_id = $2";
        strSQL = strSQL + " AND periodo = $3";
        strSQL = strSQL + " AND id_libro = $4";
        strSQL = strSQL + " AND origen = $5";
        result2 = await pool.query(strSQL,[id_anfitrion,documento_id,periodo,id_libro,origen]);

        /*if (result2.rowCount === 0)
            return res.status(404).json({
                message:"Venta no encontrada"
            });*/

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};

const actualizarAsiento = async (req,res,next)=> {
    try {
        const { //datos cabecera
            glosa,              //01
            debe,               //02
            haber,              //03
            debe_me,            //04
            haber_me,           //05
            ctrl_mod_us,        //06
            
            r_id_doc,           //07
            r_documento_id,     //08
            r_razon_social,     //09
    
            r_cod,              //10
            r_serie,            //11
            r_numero,           //12
            r_numero2,          //13
            fecemi,             //14
            fecvcto,            //15
    
            r_cod_ref,          //16
            r_serie_ref,        //17
            r_numero_ref,       //18
            fecemi_ref,         //19
            
            r_cuenta,           //20
            r_base001,          //21
            r_base002,          //22
            r_base003,          //23
            r_base004,          //24
            r_igv001,           //25
            r_igv002,           //26
            r_igv003,           //27
    
            r_monto_icbp,       //28
            r_monto_otros,      //29
            r_monto_total,      //30
            r_moneda,           //31            
            r_tc,               //32
            
            r_idbss,            //33
            //datos compras exterior
            r_id_pais,          //34
            r_id_aduana,        //35
            r_ano_dam,          //36
            //datos financiero
            r_id_mediopago,     //37
            r_voucher_banco,    //38
            r_cuenta10,         //39 new efectivo o banco X
            retencion4ta,         //40 new opcional

        } = req.body;
        
        const {
            id_anfitrion,       //41
            documento_id,       //42
            periodo,            //43
            id_libro,           //44
            num_asiento,        //45
        } = req.params;

        var strSQL;
        strSQL = "UPDATE mct_asientocontable SET ";
        strSQL = strSQL + "  glosa = $1";
        strSQL = strSQL + " ,debe = $2";
        strSQL = strSQL + " ,haber = $3";
        strSQL = strSQL + " ,debe_me = $4";
        strSQL = strSQL + " ,haber_me = $5";
        strSQL = strSQL + " ,ctrl_mod = CURRENT_TIMESTAMP";
        strSQL = strSQL + " ,ctrl_mod_us = $6";
        strSQL = strSQL + " ,r_id_doc = $7";
        strSQL = strSQL + " ,r_documento_id = $8";
        strSQL = strSQL + " ,r_razon_social = $9";

        strSQL = strSQL + " ,r_cod = $10";
        strSQL = strSQL + " ,r_serie = $11";
        strSQL = strSQL + " ,r_numero = $12";
        strSQL = strSQL + " ,r_numero2 = $13";
        strSQL = strSQL + " ,r_fecemi = $14";
        strSQL = strSQL + " ,r_fecvcto = $15";
        strSQL = strSQL + " ,r_cod_ref = $16";
        strSQL = strSQL + " ,r_serie_ref = $17";
        strSQL = strSQL + " ,r_numero_ref = $18";
        strSQL = strSQL + " ,r_fecemi_ref = $19";

        strSQL = strSQL + " ,r_cuenta = $20";
        
        strSQL = strSQL + " ,r_base001 = $21";
        strSQL = strSQL + " ,r_base002 = $22";
        strSQL = strSQL + " ,r_base003 = $23";
        strSQL = strSQL + " ,r_base004 = $24";
        strSQL = strSQL + " ,r_igv001 = $25";
        strSQL = strSQL + " ,r_igv002 = $26";
        strSQL = strSQL + " ,r_igv003 = $27";
        strSQL = strSQL + " ,r_monto_icbp = $28";
        strSQL = strSQL + " ,r_monto_otros = $29";
        strSQL = strSQL + " ,r_monto_total = $30";
        strSQL = strSQL + " ,r_moneda = $31";
        strSQL = strSQL + " ,r_tc = $32";
        //datos bien
        strSQL = strSQL + " ,r_idbss = $33";
        //datos compras exterior
        strSQL = strSQL + " ,r_id_pais = $34";
        strSQL = strSQL + " ,r_id_aduana = $35";
        strSQL = strSQL + " ,r_ano_dam = $36";
        //datos financiero
        strSQL = strSQL + " ,r_id_mediopago = $37";
        strSQL = strSQL + " ,r_voucher_banco = $38";
        strSQL = strSQL + " ,r_cuenta10 = $39";
        strSQL = strSQL + " ,retencion4ta = $40"; //new opcional

        strSQL = strSQL + " WHERE id_usuario = $41";
        strSQL = strSQL + " AND documento_id = $42";
        strSQL = strSQL + " AND periodo = $43";
        strSQL = strSQL + " AND id_libro = $44";
        strSQL = strSQL + " AND num_asiento = $45";

        const parametros = [   
            devuelveCadenaNull(glosa),          //01
            devuelveNumero(debe),               //02
            devuelveNumero(haber),              //03
            devuelveNumero(debe_me),            //04
            devuelveNumero(haber_me),           //05

            devuelveCadenaNull(ctrl_mod_us),     //06
            devuelveCadenaNull(r_id_doc),        //07
            devuelveCadenaNull(r_documento_id),  //08
            devuelveCadenaNull(r_razon_social),  //09

            devuelveCadenaNull(r_cod),           //10
            devuelveCadenaNull(r_serie),         //11
            devuelveCadenaNull(r_numero),        //12
            devuelveCadenaNull(r_numero2),       //13
            devuelveCadenaNull(fecemi),          //14
            devuelveCadenaNull(fecvcto),         //15

            devuelveCadenaNull(r_cod_ref),       //16
            devuelveCadenaNull(r_serie_ref),     //17
            devuelveCadenaNull(r_numero_ref),    //18
            devuelveCadenaNull(fecemi_ref),      //19
            
            devuelveCadenaNull(r_cuenta),        //20
            devuelveCadenaNull(r_base001),       //21
            devuelveCadenaNull(r_base002),       //22
            devuelveCadenaNull(r_base003),       //23
            devuelveCadenaNull(r_base004),       //24
            devuelveCadenaNull(r_igv001),        //25
            devuelveCadenaNull(r_igv002),        //26
            devuelveCadenaNull(r_igv003),        //27
            
            devuelveCadenaNull(r_monto_icbp),    //28
            devuelveCadenaNull(r_monto_otros),   //29
            devuelveCadenaNull(r_monto_total),   //30
            devuelveCadenaNull(r_moneda),        //31
            devuelveCadenaNull(r_tc),            //32

            devuelveCadenaNull(r_idbss),         //33
            devuelveCadenaNull(r_id_pais),       //34
            devuelveCadenaNull(r_id_aduana),     //35
            devuelveCadenaNull(r_ano_dam),       //36
            devuelveCadenaNull(r_id_mediopago),  //37
            devuelveCadenaNull(r_voucher_banco), //38
            devuelveCadenaNull(r_cuenta10),      //39
            devuelveCadenaNull(retencion4ta),      //40

            //Seccion parametros
            id_anfitrion,       //41
            documento_id,       //42
            periodo,            //43
            id_libro,           //44
            num_asiento,        //45
        ];

        console.log(strSQL);
        console.log(parametros);

        const result = await pool.query(strSQL,parametros);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Asiento no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

const anularAsiento = async (req,res,next)=> {
    try {
        const {cod,serie,num,elem} = req.params;
        var strSQL;
        var result;
        var result2;

        strSQL = "UPDATE mve_venta_detalle SET registrado = 0, estado = 'ANULADO'";
        strSQL = strSQL + " WHERE comprobante_original_codigo = $1";
        strSQL = strSQL + " AND comprobante_original_serie = $2";
        strSQL = strSQL + " AND comprobante_original_numero = $3";
        strSQL = strSQL + " AND elemento = $4";
        result = await pool.query(strSQL,[cod,serie,num,elem]);

        strSQL = "UPDATE mve_venta SET registrado = 0";
        strSQL = strSQL + " WHERE comprobante_original_codigo = $1";
        strSQL = strSQL + " AND comprobante_original_serie = $2";
        strSQL = strSQL + " AND comprobante_original_numero = $3";
        strSQL = strSQL + " AND elemento = $4";
        result2 = await pool.query(strSQL,[cod,serie,num,elem]);

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};

const crearAsientoMasivoVentas = async (req,res,next)=> {
    let strSQL;
    const {id_anfitrion,documento_id,periodo,id_cuenta} = req.params;

    const datos = req.body;
    //console.log(datos);
    //console.log('parametros: ',id_anfitrion,documento_id,periodo,id_cuenta);

    strSQL = "CALL pgenerarasientosventa($1,$2,$3,$4,$5)";
    try {
        const parametros = [datos,id_anfitrion,documento_id,periodo,id_cuenta];
        const result = await pool.query(strSQL, parametros);
        console.log('ventas ok');
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        console.log('hubo un problema: ', error.message);
        next(error)
    }
};

const crearAsientoMasivoCompras = async (req,res,next)=> {
    let strSQL;
    const {id_anfitrion,documento_id,periodo,id_cuenta,id_cuenta_cargo,id_cuenta_abono } = req.params;

    const datos = req.body;
    console.log(datos);
    strSQL = "CALL pgenerarasientoscompra($1,$2,$3,$4,$5,$6,$7)";
    try {
        const parametros = [datos,id_anfitrion,documento_id,periodo,id_cuenta,id_cuenta_cargo,id_cuenta_abono];
        const result = await pool.query(strSQL, parametros);
        console.log('compras ok');
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        console.log('hubo un problema: ', error.message);
        next(error)
    }
};
const crearAsientoMasivoVentasContado = async (req,res,next)=> {
    let strSQL;
    const {id_anfitrion,documento_id,periodo} = req.params;

    //const datos = req.body;
    //console.log(datos);
    //console.log('parametros: ',id_anfitrion,documento_id,periodo);

    strSQL = "CALL pgenerarcontraasientoscaja($1,$2,$3)";
    try {
        const parametros = [id_anfitrion,documento_id,periodo];
        const result = await pool.query(strSQL, parametros);
        console.log('contrasientos ventas al contado ok');
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        console.log('hubo un problema: ', error.message);
        next(error)
    }
};
const crearAsientoMasivoDifCambio = async (req,res,next)=> {
    let strSQL;
    const {id_anfitrion,documento_id,periodo} = req.params;

    //const datos = req.body;
    //console.log(datos);
    //console.log('parametros: ',id_anfitrion,documento_id,periodo);

    strSQL = "CALL pgenerarasientodifcambio($1,$2,$3)";
    try {
        const parametros = [id_anfitrion,documento_id,periodo];
        const result = await pool.query(strSQL, parametros);
        console.log('diferencia de cambio ok');
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        console.log('hubo un problema: ', error.message);
        next(error)
    }
};
const crearAsientoMayorizado = async (req,res,next)=> {
    let strSQL;
    const {id_anfitrion,documento_id,periodo,id_libro} = req.params;

    //const datos = req.body;
    //console.log(datos);
    //console.log('parametros: ',id_anfitrion,documento_id,periodo);

    strSQL = "CALL pgenerarasientomayorizado($1,$2,$3,$4)";
    try {
        const parametros = [id_anfitrion,documento_id,periodo,id_libro];
        const result = await pool.query(strSQL, parametros);
        console.log('mayor en diario ok');
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        console.log('hubo un problema: ', error.message);
        next(error)
    }
};

//version json
/*const crearAsientoMasivoCompras = async (req,res,next)=> {
    let strSQL;
    const {id_anfitrion,documento_id,periodo,id_cuenta,id_cuenta_cargo,id_cuenta_abono } = req.params;

    const datos = req.body;
    //const primerElemento = datos[0];
    //console.log(datos);
    //console.log('parametros: ',id_anfitrion,documento_id,periodo,id_cuenta,id_cuenta_cargo,id_cuenta_abono);
    const datosJSON = JSON.stringify(datos);     
    //console.log(datosJSON);
    strSQL = "CALL pgenerarasientoscompra($1,$2,$3,$4,$5,$6,$7)";
    try {
        const parametros = [datosJSON,id_anfitrion,documento_id,periodo,id_cuenta,id_cuenta_cargo,id_cuenta_abono];
        const result = await pool.query(strSQL, parametros);
        console.log('compras ok');
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        console.log('hubo un problema: ', error.message);
        next(error)
    }
};*/

module.exports = {
    obtenerTodosAsientosCompra,
    obtenerTodosAsientosVenta,
    obtenerTodosAsientosComparacion,
    obtenerTodosAsientosPrev,
    obtenerTodosAsientosPrevCaja,
    obtenerTodosAsientosCaja,
    obtenerTodosAsientosDiario,
    generarSireCompras,
    generarSireComprasNoDomic,
    generarSireVentas,
    obtenerTodosAsientosPlan,
    obtenerAsiento,
    crearAsiento,
    crearAsientoMasivoVentas,
    crearAsientoMasivoCompras,
    crearAsientoMasivoVentasContado,
    crearAsientoMasivoDifCambio,
    crearAsientoMayorizado,
    importarExcelRegVentas,
    importarExcelRegCompras,
    importarSireRegVentas,
    importarSireRegCompras,
    eliminarAsiento,
    eliminarAsientoOrigen,
    actualizarAsiento,
    anularAsiento
 }; 