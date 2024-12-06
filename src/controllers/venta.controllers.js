const pool = require('../db');
const {devuelveCadenaNull,devuelveNumero, convertirFechaString, convertirFechaStringComplete, corregirTCPEN, corregirMontoNotaCredito} = require('../utils/libreria.utils');
const fetch = require('node-fetch');

const obtenerRegistroTodos = async (req,res,next)=> {
    //Solo Cabeceras
    const {periodo,id_anfitrion,documento_id} = req.params;
    console.log(periodo,id_anfitrion,documento_id);
    
    let strSQL;
    strSQL = "SELECT ";
        //01 ruc gen        (campos vacios)
        //02 razon gen      (campos vacios)
        //03 periodo gen    (campos vacios)
        //04 car sunat      (campos vacios)
    strSQL += "  cast(r_fecemi as varchar)::varchar(50) as r_fecemi";   //05
    strSQL += " ,cast(r_fecvcto as varchar)::varchar(50) as r_fecvcto"; //06
    strSQL += " ,r_cod";                                                //07
    strSQL += " ,r_serie";                                              //08
    strSQL += " ,r_numero";                                             //09
    strSQL += " ,(r_cod || '-' || r_serie || '-' || r_numero)::varchar(50) as comprobante"; //(07-08-09)
    strSQL += " ,r_id_doc";                                             //11
    strSQL += " ,r_documento_id";                                       //12
    strSQL += " ,r_razon_social";                                       //13
    strSQL += " ,r_base001 as export";                                  //14
    strSQL += " ,r_base002 as base";                                    //15
    strSQL += " ,r_igv002 as igv";                                      //16
    strSQL += " ,r_base003 as exonera";                                 //17
    strSQL += " ,r_base004 as inafecta";                                //18
    strSQL += " ,r_monto_icbp";                                         //19
    strSQL += " ,r_monto_otros";                                        //20
    strSQL += " ,r_monto_total";                                        //21
    strSQL += " ,r_moneda";                                             //22
    strSQL += " ,r_tc";                                                 //23
    strSQL += " ,cast(r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref";//24
    strSQL += " ,r_cod_ref";                                            //25
    strSQL += " ,r_serie_ref";                                          //26
    strSQL += " ,r_numero_ref";                                         //27
    
    strSQL += " ,glosa";
    strSQL += " ,r_vfirmado";
    strSQL += " ,elemento";
    strSQL += " ,(r_cod_ref || '-' || r_serie_ref || '-' || r_numero_ref)::varchar(50) as comprobante_ref"; //(07-08-09)

    strSQL += " FROM";
    strSQL += " mve_venta ";
    strSQL += " WHERE periodo = '" + periodo + "'";
    strSQL += " AND id_usuario = '" + id_anfitrion + "'";
    strSQL += " AND documento_id = '" + documento_id + "'";
    strSQL += " AND r_cod <> 'NP'"; //evitar pedidos en proceso
    strSQL += " ORDER BY r_cod,r_serie,r_numero DESC";
    
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

const obtenerRegistro = async (req,res,next)=> {
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,elem} = req.params;
        let strSQL ;
        
        strSQL = "SELECT mve_venta.* ";
        strSQL += " ,cast(mve_venta.r_fecemi as varchar)::varchar(50) as fecemi";
        strSQL += " ,cast(mve_venta.r_fecvcto as varchar)::varchar(50) as fecvcto";
        strSQL += " ,cast(mve_venta.r_fecemi_ref as varchar)::varchar(50) as fecemi_ref";
        strSQL += " FROM mve_venta";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        //console.log(strSQL);

        const result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Registro no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearRegistro = async (req,res,next)=> {
    let strSQL;
    const { //datos cabecera
        id_anfitrion,   //01
        documento_id,   //02
        periodo,        //03
        r_cod,          //04
        r_serie,        //05
        //r_numero,       //generado
        fecemi,         //06
        fecvcto,        //07

        glosa,          //08
        debe,           //09
        haber,          //10
        debe_me,        //11
        haber_me,       //12
        //ctrl_crea,    // timestamp generado
        ctrl_crea_us,   //13
        r_id_doc,       //14
        r_documento_id, //15
        r_razon_social, //16

        r_cod_ref,      //17
        r_serie_ref,    //18
        r_numero_ref,   //19
        fecemi_ref,   //20
        
        r_base001,      //21
        r_base002,      //22
        r_base003,      //23
        r_base004,      //24
        r_igv002,       //25

        r_monto_icbp,   //26
        r_monto_otros,  //27
        r_monto_total,  //28
        r_moneda,       //29
        r_tc,           //30
        
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

    strSQL = "INSERT INTO mve_venta";
    strSQL +=  " (";
    strSQL += "  id_usuario";   //01
    strSQL += " ,documento_id"; //02
    strSQL += " ,periodo";      //03
    strSQL += " ,r_cod";        //04
    strSQL += " ,r_serie";      //05
    strSQL += " ,r_numero";     //generado *
    strSQL += " ,elemento";     //generado *
    strSQL += " ,r_fecemi";     //06
    strSQL += " ,r_fecvcto";    //07

    strSQL += " ,glosa";        //08
    strSQL += " ,debe";         //09
    strSQL += " ,haber";        //10
    strSQL += " ,debe_me";      //11
    strSQL += " ,haber_me";     //12

    strSQL += " ,ctrl_crea";    //generado *
    strSQL += " ,ctrl_crea_us"; //13
    strSQL += " ,r_id_doc";     //14
    strSQL += " ,r_documento_id";   //15
    strSQL += " ,r_razon_social";   //16

    strSQL += " ,r_cod_ref";    //17
    strSQL += " ,r_serie_ref";  //18
    strSQL += " ,r_numero_ref"; //19
    strSQL += " ,r_fecemi_ref"; //20
    
    strSQL += " ,r_base001";    //21
    strSQL += " ,r_base002";    //22
    strSQL += " ,r_base003";    //23
    strSQL += " ,r_base004";    //24

    strSQL += " ,r_igv002";     //25
    
    strSQL += " ,r_monto_icbp";  //26
    strSQL += " ,r_monto_otros"; //27
    strSQL += " ,r_monto_total"; //28
    strSQL += " ,r_moneda";      //29
    strSQL += " ,r_tc";          //30

    strSQL += " )";
    strSQL += " VALUES";
    strSQL += " (";
    strSQL += "  $1";
    strSQL += " ,$2";
    strSQL += " ,$3";

    if (r_cod != '07' && r_cod != '08'){
        //Fact,Bol,Pedidos,etc
        strSQL += " ,$4";
        strSQL += " ,$5";
        strSQL += " ,(select * from fct_genera_venta($1,$2,$3,$4,$5))"; //elementos pkey ... body
        strSQL += " ,1"; //elemento 1
    }
    else{
        //Solo NC,ND, ref para mantener pkey comprobante original
        strSQL += " ,$17";
        strSQL += " ,$18";
        strSQL += " ,$19";
        strSQL += " ,(select * from fct_genera_venta_elem($1,$2,$3,$17,$18,$19))"; //elementos ref_ ... body
    }
    //elemento depende del tipo comprobante
    //elemento = 1  <> '07' && '08'
    //caso contrario 
    //elemento = generarElemento()
    
    strSQL += " ,$6";
    strSQL += " ,$7";
    strSQL += " ,$8"; //glosa
    strSQL += " ,$9";
    strSQL += " ,$10";
    strSQL += " ,$11";
    strSQL += " ,$12";
    strSQL += " ,CURRENT_TIMESTAMP"; //ctrl_crea
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
    strSQL += " ) RETURNING *";

    try {
        //console.log(strSQL);
        const parametros = [   
            id_anfitrion,   //01
            documento_id,   //02
            periodo,        //03
            r_cod,          //04
            r_serie,        //05
            devuelveCadenaNull(fecemi),        //06
            devuelveCadenaNull(fecvcto),       //07

            devuelveCadenaNull(glosa),          //08
            devuelveNumero(debe),               //09
            devuelveNumero(haber),              //10
            devuelveNumero(debe_me),            //11
            devuelveNumero(haber_me),           //12

            ctrl_crea_us,    //13
            devuelveCadenaNull(r_id_doc),       //14
            devuelveCadenaNull(r_documento_id), //15
            devuelveCadenaNull(r_razon_social), //16

            devuelveCadenaNull(r_cod_ref),      //17
            devuelveCadenaNull(r_serie_ref),    //18
            devuelveCadenaNull(r_numero_ref),   //19
            devuelveCadenaNull(fecemi_ref),     //20
            
            devuelveCadenaNull(r_base001),      //21
            devuelveCadenaNull(r_base002),      //22
            devuelveCadenaNull(r_base003),      //23
            devuelveCadenaNull(r_base004),      //24
            devuelveCadenaNull(r_igv002),       //25
            
            devuelveCadenaNull(r_monto_icbp),    //26
            devuelveCadenaNull(r_monto_otros),   //27
            devuelveCadenaNull(r_monto_total),   //28
            devuelveCadenaNull(r_moneda),        //29
            devuelveCadenaNull(r_tc),            //30

        ];
        //console.log(parametros);
        const result = await pool.query(strSQL, parametros);
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const generarRegistro = async (req,res,next)=> {
    const { id_anfitrion, documento_id, periodo, id_invitado, fecha } = req.body;

    try {
      // Ejecutar la función fve_crear_pedido en PostgreSQL
      const result = await pool.query(
        `SELECT r_numero, r_fecemi, r_monto_total 
         FROM fve_crear_pedido($1, $2, $3, $4, $5)`,
        [id_anfitrion, documento_id, periodo, id_invitado, fecha]
      );
  
      // Si la función devolvió resultados, enviarlos al frontend
      if (result.rows.length > 0) {
        res.status(200).json({
          success: true,
          ... result.rows[0], // Devolver el primer (y único) resultado
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'No se encontraron resultados o no se pudo crear el pedido.',
        });
      }
    } catch (error) {
      console.error('Error al ejecutar la función fve_crear_pedido:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor.',
      });
    }

};
const generarComprobante = async (req,res,next)=> {
    const { id_anfitrion,   //01
            documento_id,   //02    
            periodo,        //03
            id_invitado,    //04
            fecha,          //05
            r_cod,          //06
            r_serie,        //07
            r_numero,       //08
            r_cod_emitir,    //09
            r_id_doc,           //10
            r_documento_id,     //11
            r_razon_social,     //12
            r_direccion,        //13
    } = req.body;
    //faltan mas parametros de razon social ruc y direccion

    try {
      // Ejecutar la función fve_crear_pedido en PostgreSQL
      const result = await pool.query(
        `SELECT r_cod, r_serie, r_numero, r_fecemi, r_monto_total 
         FROM fve_crear_comprobante($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id_anfitrion, documento_id, periodo, id_invitado, fecha, r_cod, r_serie, r_numero, r_cod_emitir,
         r_id_doc, r_documento_id, r_razon_social, r_direccion
        ]
      );
  
      // Si la función devolvió resultados, enviarlos al frontend
      if (result.rows.length > 0) {
        res.status(200).json({
          success: true,
          ... result.rows[0], // Devolver el primer (y único) resultado
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'No se encontraron resultados o no se pudo crear el pedido.',
        });
      }
    } catch (error) {
      console.error('Error al ejecutar la función fve_crear_pedido:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor.',
      });
    }

};

const eliminarRegistro = async (req,res,next)=> {
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,elem} = req.params;
        var strSQL;
        var result;
        var result2;
        
        //primero eliminar todos detalles
        strSQL = "DELETE FROM mve_ventadet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";

        //console.log(strSQL);
        //console.log([periodo,id_anfitrion,documento_id]);
        result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem]);

        //luego eliminar cabecera
        strSQL = "DELETE FROM mve_venta ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";

        //console.log(strSQL);
        //console.log([id_anfitrion,documento_id,periodo,id_libro,num_asiento]);
        result2 = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem]);
        if (result2.rowCount === 0)
            return res.status(404).json({
                message:"Venta no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};
const eliminarRegistroItem = async (req,res,next)=> {
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,elem,item} = req.params;
        var strSQL;
        var result;
        
        //eliminar un item determinado
        strSQL = "DELETE FROM mve_ventadet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        strSQL += " AND item = $8";

        //console.log(strSQL);
        result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem,item]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Item no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};


const eliminarRegistroMasivo = async (req,res,next)=> {
    try {
        const {periodo,id_anfitrion,documento_id,cod} = req.params;
        var strSQL;
        var result;
        var result2;
        
        //primero eliminar todos detalles
        strSQL = "DELETE FROM mve_ventadet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";

        //console.log(strSQL);
        //console.log([periodo,id_anfitrion,documento_id]);
        result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod]);

        //luego eliminar cabecera
        strSQL = "DELETE FROM mve_venta ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";

        //console.log(strSQL);
        //console.log([id_anfitrion,documento_id,periodo,id_libro,num_asiento]);
        result2 = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod]);
        if (result2.rowCount === 0)
            return res.status(404).json({
                message:"Venta no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};

const actualizarRegistro = async (req,res,next)=> {
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

const anularRegistro = async (req,res,next)=> {
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,elem} = req.params;
        var strSQL;
        var result;
        var result2;

        strSQL = "UPDATE mve_ventadet SET registrado = 0";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem]);

        strSQL = "UPDATE mve_venta SET registrado = 0";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        result2 = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem]);

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

const generarCPE = async (req,res,next)=> {
    const {
        p_periodo,
        p_id_usuario,
        p_documento_id,
        p_r_cod,
        p_r_serie,
        p_r_numero,
        p_elemento,
      } = req.body;
      
      try {
        // 1. Lectura de datos de la tabla mad_usuario_contabilidad
        const datosQuery = await pool.query(
          `
          SELECT * FROM mad_usuariocontabilidad
          WHERE id_usuario = $1 AND documento_id = $2 AND tipo = 'ADMIN'
          `,
          [p_id_usuario, p_documento_id]
        );
        const datos = datosQuery.rows[0];
        if (!datos) {
          return res.status(404).json({ error: "Datos de usuario no encontrados" });
        }
    
        // 2. Lectura de datos de la tabla mve_venta
        const ventaQuery = await pool.query(
          `
          SELECT * FROM mve_venta
          WHERE periodo = $1 AND id_usuario = $2 AND documento_id = $3
            AND r_cod = $4 AND r_serie = $5 AND r_numero = $6 AND elemento = $7
          `,
          [p_periodo, p_id_usuario, p_documento_id, p_r_cod, p_r_serie, p_r_numero, p_elemento]
        );
        const venta = ventaQuery.rows[0];
        if (!venta) {
          return res.status(404).json({ error: "Datos de venta no encontrados" });
        }
    
        // 3. Lectura de datos de la tabla mve_ventadet
        const ventadetQuery = await pool.query(
          `
          SELECT * FROM mve_ventadet
          WHERE periodo = $1 AND id_usuario = $2 AND documento_id = $3
            AND r_cod = $4 AND r_serie = $5 AND r_numero = $6 AND elemento = $7
          `,
          [p_periodo, p_id_usuario, p_documento_id, p_r_cod, p_r_serie, p_r_numero, p_elemento]
        );
        const ventadet = ventadetQuery.rows;
    
        // 4. Construir el JSON
        const jsonPayload = {
          empresa: {
            ruc: datos.documento_id,
            razon_social: datos.razon_social,
            nombre_comercial: datos.razon_social,
            domicilio_fiscal: datos.direccion,
            ubigeo: datos.direccion,
            distrito: datos.distrito,
            provincia: datos.provincia,
            departamento: datos.departamento,
            modo: "0",
            usu_secundario_produccion_user: datos.secund_user,
            usu_secundario_produccion_password: datos.secund_pwd,
          },
          cliente: {
            razon_social_nombres: venta.r_razon_social,
            numero_documento: venta.r_documento_id,
            codigo_tipo_entidad: venta.r_id_doc,
            cliente_direccion: venta.r_direccion,
          },
          venta: {
            serie: venta.r_serie,
            numero: venta.r_numero,
            
            fecha_emision: venta.r_fecemi.toISOString().split("T")[0],
            hora_emision: venta.ctrl_crea.toISOString().split("T")[1].split(".")[0],
            
            fecha_vencimiento: "",
            moneda_id: venta.r_moneda === "PEN" ? "1" : "2",
            forma_pago_id: "1",
            total_gravada: venta.r_base002,
            total_igv: venta.r_igv002,
            total_exonerada: "",
            total_inafecta: "",
            tipo_documento_codigo: venta.r_cod,
            nota: venta.glosa || "",
          },
          items: ventadet.map((item) => ({
            producto: item.descripcion,
            cantidad: item.cantidad,
            precio_base: item.monto_base,
            codigo_sunat: "-",
            codigo_producto: item.id_producto,
            codigo_unidad: item.cont_und,
            tipo_igv_codigo: "10",
          })),
        };

        const jsonString = JSON.stringify(jsonPayload, null, 2); // Genera un JSON válido
        console.log(jsonString);

        // 5. Enviar JSON a la API de terceros con fetch
        const apiResponse = await fetch("https://facturaciondirecta.com/API_SUNAT/post.php", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          //body: JSON.stringify(jsonString),
          body: jsonString,
        });
        //const responseData = await apiResponse.json();
        
        //console.log("respuesta generada: ",responseData); //agregamos
        const responseText = await apiResponse.text(); // Captura como texto
        console.log("Respuesta del servidor:", responseText);
        

        /*if (apiResponse.ok) {
          // 6. Extraer datos de la respuesta y retornar
          const { respuesta_sunat_descripcion, ruta_xml, ruta_cdr, ruta_pdf } =
            responseData.data;
          return res.json({
            respuesta_sunat_descripcion,
            ruta_xml,
            ruta_cdr,
            ruta_pdf,
          });
        } else {
          return res
            .status(apiResponse.status)
            .json({ error: responseData || "Error en la API de terceros" });
        }*/
    
    
      } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Error en el servidor me lleva" });
      }
};

module.exports = {
    obtenerRegistroTodos,
    obtenerRegistro,
    crearRegistro,
    generarRegistro,
    generarComprobante,
    eliminarRegistro,
    eliminarRegistroItem,
    eliminarRegistroMasivo,
    actualizarRegistro,
    anularRegistro,
    generarCPE
 }; 