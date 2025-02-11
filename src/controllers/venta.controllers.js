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
    //strSQL += " ,(r_cod || '-' || r_serie || '-' || r_numero)::varchar(50) as comprobante"; //(07-08-09)
		//sirve para vista general
    strSQL += ", (COALESCE(r_cod_ref, r_cod) || '-' || ";
		strSQL += "   COALESCE(r_serie_ref, r_serie) || '-' || ";
    strSQL += "   COALESCE(r_numero_ref, r_numero))::varchar(50) as comprobante";

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
    
    //strSQL += " ,(r_cod_ref || '-' || r_serie_ref || '-' || r_numero_ref || '-' || cast(elemento as varchar))::varchar(50) as comprobante_ref"; //(07-08-09)
		//sirve como key ;)
    strSQL += ", (COALESCE(r_cod,r_cod_ref) || '-' || ";
		strSQL += "   COALESCE(r_serie,r_serie_ref) || '-' || ";
    strSQL += "   COALESCE(r_numero,r_numero_ref) || '-' || cast(elemento as varchar))::varchar(50) as comprobante_ref";
    strSQL += " ,elemento";

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
        strSQL += " ,mad_usuariocontabilidad.razon_social"; //dato para impresion
        strSQL += " ,mad_usuariocontabilidad.direccion";    //dato para impresion
        strSQL += " FROM";
        strSQL += " mve_venta LEFT JOIN mad_usuariocontabilidad";
        strSQL += " ON (mve_venta.id_usuario = mad_usuariocontabilidad.id_usuario and";
        strSQL += "     mve_venta.documento_id = mad_usuariocontabilidad.documento_id and";
        strSQL += "     'ADMIN' = mad_usuariocontabilidad.tipo)";
        strSQL += " WHERE mve_venta.periodo = $1";
        strSQL += " AND mve_venta.id_usuario = $2";
        strSQL += " AND mve_venta.documento_id = $3";
        strSQL += " AND mve_venta.r_cod = $4";
        strSQL += " AND mve_venta.r_serie = $5";
        strSQL += " AND mve_venta.r_numero = $6";
        strSQL += " AND mve_venta.elemento = $7";
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

            r_cod_ref,          //14
            r_serie_ref,        //15
            r_numero_ref,       //16
            r_idmotivo_ref,     //17
    } = req.body;
    //faltan mas parametros de razon social ruc y direccion

    try {
      let result;
      if (r_cod_emitir !== '07' && r_cod_emitir !== '08') {
        console.log('fve_crear_comprobante: ',[id_anfitrion, documento_id, periodo, id_invitado, fecha, r_cod, r_serie, r_numero, r_cod_emitir,
          r_id_doc, r_documento_id, r_razon_social, r_direccion]);

        // Ejecutar la función fve_crear_comprobante en PostgreSQL
        result = await pool.query(
          `SELECT r_cod, r_serie, r_numero, r_fecemi, r_monto_total 
          FROM fve_crear_comprobante($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [id_anfitrion, documento_id, periodo, id_invitado, fecha, r_cod, r_serie, r_numero, r_cod_emitir,
          r_id_doc, r_documento_id, r_razon_social, r_direccion
          ]
        );
      }else{
        console.log('fve_crear_comprobante_ref: ',[id_anfitrion, documento_id, periodo, id_invitado, fecha, r_cod, r_serie, r_numero, r_cod_emitir,
          r_id_doc, r_documento_id, r_razon_social, r_direccion, r_cod_ref, r_serie_ref, r_numero_ref, r_idmotivo_ref
          ]);
        // Ejecutar la función fve_crear_comprobante_ref en PostgreSQL (Tratamiento Nota Credito/Debito)
        result = await pool.query(
          `SELECT r_cod, r_serie, r_numero, r_fecemi, r_monto_total 
          FROM fve_crear_comprobante_ref($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [id_anfitrion, documento_id, periodo, id_invitado, fecha, r_cod, r_serie, r_numero, r_cod_emitir,
          r_id_doc, r_documento_id, r_razon_social, r_direccion, r_cod_ref, r_serie_ref, r_numero_ref, r_idmotivo_ref
          ]
        );
      }
  
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

const clonarRegistro = async (req,res,next)=> {
  //Clonamos cualquier registro(Bol,Fact,NotaVenta) y lo convertimos a Nota en Proceso
  //Luego se habilida Emitir en otro comprobante (Aprovechamos disponibilidad para notas credito)
  const { id_anfitrion, documento_id, periodo, id_invitado, fecha, r_cod, r_serie, r_numero } = req.body;

  try {
    // Ejecutar la función fve_crear_pedido en PostgreSQL
    const result = await pool.query(
      `SELECT r_numero, r_fecemi, r_monto_total 
       FROM fve_clonar_pedido($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id_anfitrion, documento_id, periodo, id_invitado, fecha, r_cod, r_serie, r_numero]
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
        message: 'No se encontraron resultados o no se pudo clonar el pedido.',
      });
    }
  } catch (error) {
    console.error('Error al ejecutar la función fve_clonar_pedido:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor.',
    });
  }

};

const eliminarRegistro = async (req,res,next)=> {
  //Clonamos cualquier registro(Bol,Fact,NotaVenta) y lo convertimos a Nota en Proceso
  //Luego se habilida Emitir en otro comprobante (Aprovechamos disponibilidad para notas credito)
  const { periodo, id_anfitrion, documento_id, r_cod, r_serie, r_numero, elemento } = req.body;

  try {
    console.log([periodo, id_anfitrion, documento_id, r_cod, r_serie, r_numero, elemento]);
    // Ejecutar la función fve_crear_pedido en PostgreSQL
    const result = await pool.query(
      `SELECT fve_eliminar_venta($1, $2, $3, $4, $5, $6, $7)::boolean AS success`,
      [periodo, id_anfitrion, documento_id, r_cod, r_serie, r_numero, elemento]
    );

    if (result.rowCount === 0) {
        return res.status(404).json({
            success:false,
            message:"Venta no encontrada"
        });
    }else{
        return res.status(200).json({
          success:true,
          message:"Venta eliminada"
      });
    }

  } catch (error) {
    console.log('Error ejecutando la función:', error);
    return false;
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
        const { 
          periodo,        //01
          id_anfitrion,   //02
          documento_id,   //03    
          r_cod,          //04
          r_serie,        //05
          r_numero,       //06
          elemento,     //07 new
          
          id_invitado,        //08
          fecha,              //09
          r_id_doc,           //10
          r_documento_id,     //11
          r_razon_social,     //12
          r_direccion,        //13

        } = req.body;
        //faltan mas parametros de razon social ruc y direccion
    
        let strSQL;
        strSQL = "UPDATE mve_venta SET ";
        strSQL += "  ctrl_mod = CURRENT_TIMESTAMP";
        strSQL += " ,ctrl_mod_us = $8";
        strSQL += " ,r_fecemi = $9";
        strSQL += " ,r_id_doc = $10";
        strSQL += " ,r_documento_id = $11";
        strSQL += " ,r_razon_social = $12";
        strSQL += " ,r_direccion = $13";

        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        strSQL += " RETURNING *";
        
        const parametros = [   
            //Seccion parametros
            periodo,            //01
            id_anfitrion,       //02
            documento_id,       //03
            r_cod,              //04
            r_serie,            //05
            r_numero,           //06
            elemento,         //07 new

            id_invitado,       //08
            devuelveCadenaNull(fecha),          //09
            devuelveCadenaNull(r_id_doc),       //10
            devuelveCadenaNull(r_documento_id), //11
            devuelveCadenaNull(r_razon_social), //12
            devuelveCadenaNull(r_direccion),    //13
        ];

        console.log(strSQL);
        console.log(parametros);

        const result = await pool.query(strSQL,parametros);

        /*if (result.rowCount === 0)
            return res.status(404).json({
                message:"Venta no encontrada"
            });
        return res.sendStatus(204);*/
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
        console.log(error.message);
        res.status(500).json({
          success: false,
          message: error.message,
        });
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
            token:datos.token_factintegral,
            ruc: datos.documento_id,
            razon_social: datos.razon_social,
            nombre_comercial: datos.razon_social,
            domicilio_fiscal: datos.direccion,
            ubigeo: datos.ubigeo,
            distrito: datos.distrito,
            provincia: datos.provincia,
            departamento: datos.departamento,
            modo: "1", //0: prueba  1:produccion
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
            serie: (venta.r_serie_ref==null)? venta.r_serie:venta.r_serie_ref,      //new mod
            numero: (venta.r_numero_ref==null)? venta.r_numero:venta.r_numero_ref,  //new mod
            
            fecha_emision: venta.r_fecemi.toISOString().split("T")[0],
            hora_emision: venta.ctrl_crea.toISOString().split("T")[1].split(".")[0],
            
            fecha_vencimiento: "",
            moneda_id: "1",     //hardcode temporal
            forma_pago_id: "1", //hardcode temporal
            total_gravada: venta.r_base002,
            total_igv: venta.r_igv002,
            total_exonerada: "",
            total_inafecta: "",
            nota: venta.glosa || "",
            tipo_documento_codigo: (venta.r_cod_ref==null)? venta.r_cod:venta.r_cod_ref, //new mod
            
            relacionado_serie:(venta.r_serie_ref==null)? '':venta.r_serie,      //new mod
            relacionado_numero:(venta.r_numero_ref==null)? '':venta.r_numero,   //new mod
            relacionado_tipo_documento:(venta.r_cod_ref==null)? '':venta.r_cod, //new mod
            relacionado_motivo_codigo:"01" //anulacion hardcodeado temporal
                
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
        //Harcode necesario, API 01

        let strUrlApi = "https://facturaciondirecta.com/customers/API_SUNAT/post.php";
        // Usamos replace con una expresión regular para encontrar 'API_SUNAT' y reemplazarlo
        strUrlApi = strUrlApi.replace("API_SUNAT", `API_SUNAT_T_${datos.documento_id}`);
        
        const apiResponse = await fetch(strUrlApi, {
          method: "POST",
          //body: JSON.stringify(jsonString),
          body: jsonString,
          headers: {
                "Content-Type":"application/json"
          }
          /*headers: {
            "Content-Type":"application/json",
            'Authorization': `Bearer ${datos.token_factintegral}`
          }*/
        });
        
        const responseData = await apiResponse.json();
        console.log("respuesta generada: ",responseData); //agregamos

        if (apiResponse.ok) {
          // 6. Extraer datos de la respuesta y retornar
          const {
            respuesta_sunat_descripcion,
            ruta_xml,
            ruta_cdr,
            ruta_pdf,
            codigo_hash,
          } = responseData.data;
        
          // Extraer directamente el valor del segundo elemento del objeto `codigo_hash`
          console.log('codigo_hash: ',codigo_hash);
          const valorhash = codigo_hash ? Object.values(codigo_hash)[0] : null;

                  // 2. Lectura de datos de la tabla mve_venta
          await pool.query(
            `
            UPDATE mve_venta set r_vfirmado = $8
            WHERE periodo = $1 AND id_usuario = $2 AND documento_id = $3
              AND r_cod = $4 AND r_serie = $5 AND r_numero = $6 AND elemento = $7
            `,
            [p_periodo, p_id_usuario, p_documento_id, p_r_cod, p_r_serie, p_r_numero, p_elemento, valorhash]
          );

          return res.json({
            respuesta_sunat_descripcion,
            ruta_xml,
            ruta_cdr,
            ruta_pdf,
            valorhash, // Incluye el nuevo campo en la respuesta
          });
        } else {
          return res
            .status(apiResponse.status)
            .json({ error: responseData || "Error en la API de terceros" });
        }
            
    
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
    clonarRegistro,
    eliminarRegistro,
    eliminarRegistroItem,
    eliminarRegistroMasivo,
    actualizarRegistro,
    anularRegistro,
    generarCPE
 }; 