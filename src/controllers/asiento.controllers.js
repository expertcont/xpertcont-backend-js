const pool = require('../db');

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
    strSQL = strSQL + " ,r_id_documento";                                       //12
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
        r_id_documento,     //12
        r_documento_id,     //13
        r_razon_social,     //14

        r_cod,          //15
        r_serie,        //16
        r_numero,       //17
        r_numero2,      //18
        r_fecemi,       //19
        r_fecvcto,      //20

        r_cod_ref,      //21
        r_serie_ref,    //22
        r_numero_ref,   //23
        r_fecemi_ref,   //24
        
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

    strSQL = "INSERT INTO mct_asiento";
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
    strSQL += " ,r_id_documento";   //12
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

    const handleNullOrUndefined = (value) => (value === null || value === undefined ? null : value);
    try {
        console.log(strSQL);
        const result = await pool.query(strSQL, 
        [   
            handleNullOrUndefined(id_anfitrion),    //01
            handleNullOrUndefined(documento_id),    //02
            handleNullOrUndefined(periodo),         //03
            handleNullOrUndefined(id_libro),        //04

            handleNullOrUndefined(glosa),           //05
            handleNullOrUndefined(debe),            //06
            handleNullOrUndefined(haber),           //07
            handleNullOrUndefined(debe_me),         //08
            handleNullOrUndefined(haber_me),        //09
            handleNullOrUndefined(mayorizado),      //10

            handleNullOrUndefined(ctrl_crea_us),    //11
            handleNullOrUndefined(r_id_documento),  //12
            handleNullOrUndefined(r_documento_id),  //13
            handleNullOrUndefined(r_razon_social),  //14

            handleNullOrUndefined(r_cod),           //15
            handleNullOrUndefined(r_serie),         //16
            handleNullOrUndefined(r_numero),        //17
            handleNullOrUndefined(r_numero2),       //18
            handleNullOrUndefined(r_fecemi),        //19
            handleNullOrUndefined(r_fecvcto),       //20

            handleNullOrUndefined(r_cod_ref),       //21
            handleNullOrUndefined(r_serie_ref),     //22
            handleNullOrUndefined(r_numero_ref),    //23
            handleNullOrUndefined(r_fecemi_ref),    //24
            
            handleNullOrUndefined(r_cuenta),        //25
            handleNullOrUndefined(r_base001),       //26
            handleNullOrUndefined(r_base002),       //27
            handleNullOrUndefined(r_base003),       //28
            handleNullOrUndefined(r_base004),       //29
            handleNullOrUndefined(r_igv001),        //30
            handleNullOrUndefined(r_igv002),        //31
            handleNullOrUndefined(r_igv003),        //32
            
            handleNullOrUndefined(r_monto_icbp),    //33
            handleNullOrUndefined(r_monto_otros),   //34
            handleNullOrUndefined(r_monto_total),   //35
            handleNullOrUndefined(r_moneda),        //36
            handleNullOrUndefined(r_tc),            //37

            handleNullOrUndefined(r_idbss),         //38
            handleNullOrUndefined(r_id_pais),       //39
            handleNullOrUndefined(r_id_aduana),     //40
            handleNullOrUndefined(r_ano_dam),       //41
            handleNullOrUndefined(r_id_mediopago),  //42
            handleNullOrUndefined(r_voucher_banco), //43
            handleNullOrUndefined(r_cuenta10),      //44
        ]
        );
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
                id_usuario,     //01
                ano,            //02
                mes,            //03
                id_libro,       //04
                num_asiento,    //05
                //datos cuerpo 
                glosa,          //06
                r_id_documento, //07
                r_documento_id, //08
                r_condicion,    //09
                r_estado,       //10
                r_cod,          //11
                r_serie,        //12
                r_numero,       //13
                r_fecemi,       //14
                r_fecpagovct,   //15
                r_cod_ref,      //16
                r_serie_ref,    //17
                r_numero_ref,   //18
                r_fecemi_ref,   //19
                r_fecpagovct_ref, //20
                r_cuenta,       //21
                r_id_base,      //22
                r_base001,      //23
                r_base002,      //24
                r_base003,      //25
                r_base004,      //26
                r_igv001,       //27
                r_igv002,       //28
                r_igv003,       //29
                r_monto_otros,  //30
                r_monto_isc,    //31
                r_monto_icbp,   //32
                r_monto_total,  //33
                r_tc,           //34
                //datos compras dolares
                r_base_me,      //35
                r_igv_me,       //36
                r_total_me,     //37
                r_id_bien,      //38
                //datos compras exterior
                r_id_pais,      //39
                r_id_aduana,    //40
                r_ano_dua,      //41
                r_comprobante_nodomic,  //42
                //datos detraccion
                r_detraccion_num,       //43
                r_detraccion_fecemi,    //44
                r_monto_detraccion,     //45
                //datos financiero
                r_id_mediopago,         //46
                r_voucher_banco,        //47
                r_cuenta10,             //48 new efectivo o banco X
            } = req.body;
        
        var strSQL;
        strSQL = "UPDATE mct_asientocontable SET ";
        strSQL = strSQL + "  glosa = $6";
        strSQL = strSQL + " ,r_id_documento = $7";
        strSQL = strSQL + " ,r_documento_id = $8";

        strSQL = strSQL + " ,r_cod = $11";
        strSQL = strSQL + " ,r_serie = $12";
        strSQL = strSQL + " ,r_numero = $13";
        strSQL = strSQL + " ,r_fecemi = $14";
        strSQL = strSQL + " ,r_fecpagovct = $15";
        strSQL = strSQL + " ,r_cod_ref = $16";
        strSQL = strSQL + " ,r_serie_ref = $17";
        strSQL = strSQL + " ,r_numero_ref = $18";
        strSQL = strSQL + " ,r_fecemi_ref = $19";
        strSQL = strSQL + " ,r_fecpagovct_ref = $20";
        strSQL = strSQL + " ,r_cuenta = $21";
        strSQL = strSQL + " ,r_id_base = $22";
        strSQL = strSQL + " ,r_base001 = $23";
        strSQL = strSQL + " ,r_base002 = $24";
        strSQL = strSQL + " ,r_base003 = $25";
        strSQL = strSQL + " ,r_base004 = $26";
        strSQL = strSQL + " ,r_igv001 = $27";
        strSQL = strSQL + " ,r_igv002 = $28";
        strSQL = strSQL + " ,r_igv003 = $29";
        strSQL = strSQL + " ,r_monto_otros = $30";
        strSQL = strSQL + " ,r_monto_isc = $31";
        strSQL = strSQL + " ,r_monto_icbp = $32";
        strSQL = strSQL + " ,r_monto_total = $33";
        strSQL = strSQL + " ,r_tc = $34";
        //datos compra me
        strSQL = strSQL + " ,r_base_me = $35";
        strSQL = strSQL + " ,r_igv_me = $36";
        strSQL = strSQL + " ,r_total_me = $37";
        //datos bien
        strSQL = strSQL + " ,r_id_bien = $38";
        //datos compras exterior
        strSQL = strSQL + " ,r_id_pais = $39";
        strSQL = strSQL + " ,r_id_aduana = $40";
        strSQL = strSQL + " ,r_ano_dua = $41";
        strSQL = strSQL + " ,r_comprobante_nodomic = $42";
        //datos detraccion
        strSQL = strSQL + " ,r_detraccion_num = $43";
        strSQL = strSQL + " ,r_detraccion_fecemi = $44";
        strSQL = strSQL + " ,r_monto_detraccion = $45";
        //datos financiero
        strSQL = strSQL + " ,r_id_mediopago = $46";
        strSQL = strSQL + " ,r_voucher_banco = $47";
        strSQL = strSQL + " ,r_cuenta10 = $48";

        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND ano = $2";
        strSQL = strSQL + " AND mes = $3";
        strSQL = strSQL + " AND id_libro = $4";
        strSQL = strSQL + " AND num_asiento = $5";
 
        const result = await pool.query(strSQL,
        [   
            id_usuario,     //01
            ano,            //02
            mes,            //03
            id_libro,       //04
            num_asiento,    //05
            //datos cuerpo 
            glosa,          //06
            r_id_documento, //07
            r_documento_id, //08
            r_condicion,    //09
            r_estado,       //10
            r_cod,          //11
            r_serie,        //12
            r_numero,       //13
            r_fecemi,       //14
            r_fecpagovct,   //15
            r_cod_ref,      //16
            r_serie_ref,    //17
            r_numero_ref,   //18
            r_fecemi_ref,   //19
            r_fecpagovct_ref, //20
            r_cuenta,       //21
            r_id_base,      //22
            r_base001,      //23
            r_base002,      //24
            r_base003,      //25
            r_base004,      //26
            r_igv001,       //27
            r_igv002,       //28
            r_igv003,       //29
            r_monto_otros,  //30
            r_monto_isc,    //31
            r_monto_icbp,   //32
            r_monto_total,  //33
            r_tc,           //34
            //datos compras dolares
            r_base_me,      //35
            r_igv_me,       //36
            r_total_me,     //37
            //datos bien
            r_id_bien,      //38
            //datos compras exterior
            r_id_pais,      //39
            r_id_aduana,    //40
            r_ano_dua,      //41
            r_comprobante_nodomic,  //42
            //datos detraccion
            r_detraccion_num,       //43
            r_detraccion_fecemi,    //44
            r_monto_detraccion,     //45
            //datos financiero
            r_id_mediopago,         //46
            r_voucher_banco,     //47
            r_cuenta10,             //48 new efectivo o banco X
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