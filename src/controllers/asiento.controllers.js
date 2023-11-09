const pool = require('../db');
const {devuelveCadenaNull,devuelveNumero} = require('../utils/libreria.utils');

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
        r_moneda,       //35
        r_monto_total,  //36
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

            devuelveCadenaNull(ctrl_crea_us),    //11
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
        ];
        console.log(parametros);
        const result = await pool.query(strSQL, parametros);
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const eliminarAsiento = async (req,res,next)=> {
    try {
        const {id_usuario, ano, mes, id_libro, num_asiento} = req.params;
        var strSQL;
        var result;
        var result2;
        
        //primero eliminar todos detalles
        strSQL = "DELETE FROM mct_asientocontabledet ";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        strSQL = strSQL + " AND ano = '" + ano + "'";
        strSQL = strSQL + " AND mes = '" + mes + "'";
        strSQL = strSQL + " AND id_libro = '" + id_libro + "'";
        strSQL = strSQL + " AND num_asiento = '" + num_asiento + "'";

        result = await pool.query(strSQL,[id_usuario,ano,mes,id_libro,num_asiento]);
        /*if (result.rowCount === 0)
            return res.status(404).json({
                message:"Detalle no encontrado"
            });
*/
        //luego eliminar cabecera
        strSQL = "DELETE FROM mct_asientocontable ";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        strSQL = strSQL + " AND ano = '" + ano + "'";
        strSQL = strSQL + " AND mes = '" + mes + "'";
        strSQL = strSQL + " AND id_libro = '" + id_libro + "'";
        strSQL = strSQL + " AND num_asiento = '" + num_asiento + "'";
        result2 = await pool.query(strSQL,[id_usuario,ano,mes,id_libro,num_asiento]);
        /*if (result2.rowCount === 0)
            return res.status(404).json({
                message:"Venta no encontrada"
            });
*/
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
            r_moneda,           //30
            r_monto_total,      //31
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

        } = req.body;
        
        const {
            id_anfitrion,       //40
            documento_id,       //41
            periodo,            //42
            id_libro,           //43
            num_asiento,        //44
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

        strSQL = strSQL + " ,r_cod = $9";
        strSQL = strSQL + " ,r_serie = $10";
        strSQL = strSQL + " ,r_numero = $11";
        strSQL = strSQL + " ,r_numero2 = $12";
        strSQL = strSQL + " ,r_fecemi = $13";
        strSQL = strSQL + " ,r_fecpagovct = $14";
        strSQL = strSQL + " ,r_cod_ref = $15";
        strSQL = strSQL + " ,r_serie_ref = $16";
        strSQL = strSQL + " ,r_numero_ref = $17";
        strSQL = strSQL + " ,r_fecemi_ref = $18";

        strSQL = strSQL + " ,r_cuenta = $19";
        
        strSQL = strSQL + " ,r_base001 = $20";
        strSQL = strSQL + " ,r_base002 = $21";
        strSQL = strSQL + " ,r_base003 = $22";
        strSQL = strSQL + " ,r_base004 = $23";
        strSQL = strSQL + " ,r_igv001 = $24";
        strSQL = strSQL + " ,r_igv002 = $25";
        strSQL = strSQL + " ,r_igv003 = $26";
        strSQL = strSQL + " ,r_monto_otros = $27";
        strSQL = strSQL + " ,r_moneda = $28";
        strSQL = strSQL + " ,r_monto_isc = $29";
        strSQL = strSQL + " ,r_monto_icbp = $30";
        strSQL = strSQL + " ,r_monto_total = $31";
        strSQL = strSQL + " ,r_tc = $32";
        //datos bien
        strSQL = strSQL + " ,r_id_bien = $33";
        //datos compras exterior
        strSQL = strSQL + " ,r_id_pais = $34";
        strSQL = strSQL + " ,r_id_aduana = $35";
        strSQL = strSQL + " ,r_ano_dam = $36";
        //datos financiero
        strSQL = strSQL + " ,r_id_mediopago = $37";
        strSQL = strSQL + " ,r_voucher_banco = $38";
        strSQL = strSQL + " ,r_cuenta10 = $39";

        strSQL = strSQL + " WHERE id_usuario = $40";
        strSQL = strSQL + " AND ano = $41";
        strSQL = strSQL + " AND mes = $42";
        strSQL = strSQL + " AND id_libro = $43";
        strSQL = strSQL + " AND num_asiento = $44";
 
        const result = await pool.query(strSQL,
        [   
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
            r_moneda,           //30
            r_monto_total,      //31
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

            //Seccion parametros
            id_anfitrion,       //40
            documento_id,       //41
            periodo,            //42
            id_libro,           //43
            num_asiento,        //44
        ]
        );

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Venta no encontrada"
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

module.exports = {
    obtenerTodosAsientosCompra,
    obtenerTodosAsientosPlan,
    obtenerAsiento,
    crearAsiento,
    eliminarAsiento,
    actualizarAsiento,
    anularAsiento
 }; 