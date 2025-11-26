const pool = require('../db');
const {devuelveCadenaNull,devuelveNumero, convertirFechaString, convertirFechaStringComplete, corregirTCPEN, corregirMontoNotaCredito} = require('../utils/libreria.utils');
const fetch = require('node-fetch');

const obtenerRegistroTodos = async (req, res, next) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;
  //console.log(periodo, id_anfitrion, documento_id, dia);

  const fechaFiltro = dia !== '*' ? `${periodo}-${dia}` : null;

  // Definición compacta de columnas
  const columnas = `
    CAST(mst_movimiento.fecha_emision AS VARCHAR(50)) AS fecha_emision,
    mst_movimiento_motivo.nombre,
    (mst_movimiento.cod || '-' ||
      mst_movimiento.serie || '-' ||
      mst_movimiento.numero)::VARCHAR(50) AS comprobante,
    (mst_movimiento.r_cod || '-' ||
      mst_movimiento.r_serie || '-' ||
      mst_movimiento.r_numero)::VARCHAR(50) AS comprobante_ref,
    mst_movimiento.r_id_doc,
    mst_movimiento.r_documento_id,
    mst_movimiento.r_razon_social,
    mst_movimiento.r_monto_total,
    mst_movimiento.r_tc,
    (mst_movimiento.gre_cod || '-' ||
      mst_movimiento.gre_serie || '-' ||
      mst_movimiento.gre_numero)::VARCHAR(50) AS gre_ref
  `;

  let query = `
    SELECT ${columnas}
    FROM mst_movimiento LEFT JOIN mst_movimiento_motivo
    ON (mst_movimiento.cod = mst_movimiento_motivo.cod and
        mst_movimiento.id_motivo = mst_movimiento_motivo.id_motivo )
    WHERE mst_movimiento.periodo = $1
      AND mst_movimiento.id_usuario = $2
      AND mst_movimiento.documento_id = $3
      AND mst_movimiento.r_cod <> 'MV'
  `;

  const params = [periodo, id_anfitrion, documento_id];

  if (fechaFiltro) {
    query += " AND mst_movimiento.fecha_emision = $4";
    params.push(fechaFiltro);
  }

  query += " ORDER BY mst_movimiento.fecha_emision DESC, mst_movimiento.cod, mst_movimiento.serie, mst_movimiento.numero DESC";

  //console.log("SQL:", query, "PARAMS:", params);

  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error("Error en obtenerRegistroTodos:", error.message);
    next(error);
  }
};

const obtenerMotivos = async (req, res, next) => {
  const { cod } = req.params;
  //console.log(periodo, id_anfitrion, documento_id, dia);

  const sQuery = `
    SELECT (id_motivo || '-' || coalesce(sa_transf,'0') || '-' || coalesce(sa_trasl,'0'))::varchar(20) as id_motivo, nombre
    FROM mst_movimiento_motivo
    WHERE cod = $1
    ORDER BY id_motivo ASC
  `;

  //console.log("SQL:", query, "PARAMS:", params);

  try {
    const { rows } = await pool.query(sQuery, [cod]);
    res.json(rows);
  } catch (error) {
    console.error("Error en obtenerRegistroTodos:", error.message);
    next(error);
  }
};

const obtenerInventario = async (req, res, next) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;

  // Si el día no es '*', arma la fecha completa, ejemplo: "2025-10-15"
  const fechaFiltro = dia !== '*' ? `${periodo}-${dia}` : null;

  /*const sQuery = `
    SELECT 
      f.*,
      (f.saldo_inicial + f.ingresos - f.egresos) AS saldo,
      p.cont_und
    FROM fst_inventario_avanzado_fecha($1, $2, $3, $4, $5, $6) AS f
    LEFT JOIN mst_producto AS p
      ON (
        CASE 
          WHEN f.sku = '1' THEN split_part(f.id_producto, '-', 1)
          ELSE f.id_producto
        END = p.id_producto
        AND p.id_usuario = $2
        AND p.documento_id = $3
      )
  `;*/
  const sQuery = `
    SELECT 
      f.*,
      (f.saldo_inicial + f.ingresos - f.egresos) AS saldo
    FROM fst_inventario_avanzado_fecha($1, $2, $3, $4, $5, $6) AS f
  `;


  // Arma los parámetros de forma ordenada
  const params = [
    periodo,               // $1
    id_anfitrion,          // $2
    documento_id,          // $3
    '',                    // $4 => id_almacen
    '',                    // $5 => id_producto
    fechaFiltro            // $6 => puede ser null
  ];

  try {
    const { rows } = await pool.query(sQuery, params);
    res.json(rows);
  } catch (error) {
    console.error("Error en obtenerInventario:", error.message);
    next(error);
  }
};

const obtenerKardex = async (req, res, next) => {
  let { periodo, id_anfitrion, documento_id, dia, id_producto, id_almacen } = req.params;

  // Si el día no es '*', arma la fecha completa, ejemplo: "2025-10-15"
  const fechaFiltro = dia !== '*' ? `${periodo}-${dia}` : null;

  // Normalizar id_producto: '' debe convertirse en null
  if (!id_producto || id_producto.trim() === '') {
    id_producto = null;
  }
  // Normalizar id_almacen: '' debe convertirse en null
  if (!id_almacen || id_almacen.trim() === '') {
    id_almacen = null;
  }

  const sQuery = `
    SELECT 
         descripcion
        ,id_producto
        ,cont_und
        ,comprobante
        ,cast(emision as varchar)::varchar as emision
        ,id_opcontable
        ,op_contable
        ,orden
        ,id_almacen
        ,ingreso
        ,egreso
        ,saldo
    FROM fst_kardex_fisico($1, $2, $3, $4, $5, $6)
  `;

  const params = [
    periodo,               // $1
    id_anfitrion,          // $2
    documento_id,          // $3
    id_almacen,            // $4
    fechaFiltro,           // $5
    id_producto            // $6
  ];

  try {
    const { rows } = await pool.query(sQuery, params);
    res.json(rows);
  } catch (error) {
    console.error("Error en obtener Kardex:", error.message);
    next(error);
  }
};

const obtenerRegistro = async (req,res,next)=> {
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num} = req.params;
        let strSQL ;
        
        strSQL = "SELECT mst_movimiento.* ";
        strSQL += " ,cast(mst_movimiento.fecha_emision as varchar)::varchar(50) as fecha_emision";
        strSQL += " ,cast(mst_movimiento.r_fecemi as varchar)::varchar(50) as fecemi";
        strSQL += " ,mad_usuariocontabilidad.razon_social"; //dato para impresion
        strSQL += " ,mad_usuariocontabilidad.direccion";    //dato para impresion
        strSQL += " FROM";
        strSQL += " mst_movimiento LEFT JOIN mad_usuariocontabilidad";
        strSQL += " ON (mst_movimiento.id_usuario = mad_usuariocontabilidad.id_usuario and";
        strSQL += "     mst_movimiento.documento_id = mad_usuariocontabilidad.documento_id and";
        strSQL += "     'ADMIN' = mad_usuariocontabilidad.tipo)";
        strSQL += " WHERE mst_movimiento.periodo = $1";
        strSQL += " AND mst_movimiento.id_usuario = $2";
        strSQL += " AND mst_movimiento.documento_id = $3";
        strSQL += " AND mst_movimiento.cod = $4";
        strSQL += " AND mst_movimiento.serie = $5";
        strSQL += " AND mst_movimiento.numero = $6";
        //console.log(strSQL);

        const result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num]);

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

    strSQL = "INSERT INTO mst_movimiento";
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
        `SELECT numero, fecha_emision 
         FROM fst_crear_movimiento($1, $2, $3, $4, $5)`,
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
          message: 'No se encontraron resultados o no se pudo crear el movimiento',
        });
      }
    } catch (error) {
      console.error('Error al ejecutar la función fst_crear_movimiento:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor.',
      });
    }

};

const generarComprobante = async (req, res, next) => {
  const datos = req.body;
  const datosJSON = JSON.stringify(datos);  //01

  const {
    periodo,              //02    
    id_anfitrion,         //03
    documento_id,         //04
    id_invitado,          //05
    cod_emitir,           //06
  } = req.params;

  try {
    // Datos de ingreso con referencia de compra
    const result = await pool.query(
      `SELECT cod, serie, numero, fecha_emision
        FROM fst_crear_comprobantejson($1, $2, $3, $4, $5, $6)`,
      [datosJSON, id_anfitrion, documento_id, periodo, id_invitado, cod_emitir]
    );

    if (result.rows.length > 0) {
      //console.log(result.rows[0]);
      res.status(200).json({
        success: true,
        ...result.rows[0],
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'No se encontraron resultados o no se pudo crear el comprobante.',
      });
    }
  } catch (error) {
    console.error('Error al ejecutar la función fst_crear_comprobante:', error);
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
      `SELECT numero, fecha_emision
       FROM fve_clonar_movimiento($1, $2, $3, $4, $5, $6, $7, $8)`,
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
  const { periodo, id_anfitrion, documento_id, r_cod, r_serie, r_numero } = req.body;

  try {
    console.log([periodo, id_anfitrion, documento_id, r_cod, r_serie, r_numero]);
    // Eliminamos comprobante de almacen SA o IA
    const result = await pool.query(
      `SELECT fst_eliminar_comprobante($1, $2, $3, $4, $5, $6)::boolean AS success`,
      [periodo, id_anfitrion, documento_id, r_cod, r_serie, r_numero]
    );

    //console.log('result.rowCount: ',result.rows[0]);
    //console.log('result.rows[0].success: ',result.rows[0].success);

    if (!result.rows[0].success) {
        return res.status(200).json({
            success:false,
            message:"Comprobante Almacen no encontrado"
        });
    }else{
        return res.status(200).json({
          success:true,
          message:"Comprobante Almacen eliminado"
      });
    }

  } catch (error) {
        return res.status(500).json({
          success:false,
          message:"Error interno en servidor (xpertcont revisar back-db)"
      });
  }

};

const eliminarRegistroItem = async (req,res,next)=> {
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,item} = req.params;
        var strSQL;
        var result;
        
        //eliminar un item determinado
        strSQL = "DELETE FROM mst_movimientodet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND cod = $4";
        strSQL += " AND serie = $5";
        strSQL += " AND numero = $6";
        strSQL += " AND item = $7";

        //console.log(strSQL);
        result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,item]);

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
        strSQL = "DELETE FROM mst_movimientodet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND cod = $4";

        //console.log(strSQL);
        //console.log([periodo,id_anfitrion,documento_id]);
        result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod]);

        //luego eliminar cabecera
        strSQL = "DELETE FROM mst_movimiento ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND cod = $4";

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
          cod,            //04
          serie,          //05
          numero,         //06
          
          id_invitado,        //07
          fecha_emision,      //08
          r_id_doc,           //09
          r_documento_id,     //10
          r_razon_social,     //11
          r_cod,              //12
          r_serie,            //13
          r_numero,           //14
        } = req.body;
        //faltan mas parametros de razon social ruc y direccion
    
        let strSQL;
        let result;
        const parametrosdet = [   
          //Seccion parametros
          periodo,            //01
          id_anfitrion,       //02
          documento_id,       //03
          cod,                //04
          serie,              //05
          numero,             //06
          devuelveCadenaNull(fecha_emision),      //07
          devuelveCadenaNull(r_id_doc),           //08
          devuelveCadenaNull(r_documento_id),     //09
          devuelveCadenaNull(r_razon_social),     //10
          devuelveCadenaNull(r_cod),              //11
          devuelveCadenaNull(r_serie),            //12
          devuelveCadenaNull(r_numero),           //13
        ];  

        const parametros = [   
            //Seccion parametros
            periodo,            //01
            id_anfitrion,       //02
            documento_id,       //03
            cod,                //04
            serie,              //05
            numero,             //06

            devuelveCadenaNull(fecha_emision),  //07
            devuelveCadenaNull(r_id_doc),       //08
            devuelveCadenaNull(r_documento_id), //09
            devuelveCadenaNull(r_razon_social), //10
            devuelveCadenaNull(r_cod),          //11
            devuelveCadenaNull(r_serie),        //12
            devuelveCadenaNull(r_numero),       //13

            id_invitado                        //14
        ];
        
        strSQL = `UPDATE mst_movimientodet SET
                           fecha_emision = $7
                          ,r_id_doc = $8
                          ,r_documento_id = $9
                          ,r_razon_social = $10
                          ,r_cod = $11                               
                          ,r_serie = $12                          
                          ,r_numero = $13
                  WHERE periodo = $1
                  AND id_usuario = $2
                  AND documento_id = $3
                  AND cod = $4
                  AND serie = $5
                  AND numero = $6`;
        result = await pool.query(strSQL,parametrosdet);

        strSQL = `UPDATE mst_movimiento SET
                           fecha_emision = $7
                          ,r_id_doc = $8
                          ,r_documento_id = $9
                          ,r_razon_social = $10
                          ,r_cod = $11                               
                          ,r_serie = $12                          
                          ,r_numero = $13
                          ,ctrl_mod_us = $14
                          ,ctrl_mod = CURRENT_TIMESTAMP
                  WHERE periodo = $1
                  AND id_usuario = $2
                  AND documento_id = $3
                  AND cod = $4
                  AND serie = $5
                  AND numero = $6
                  RETURNING *`;
        result = await pool.query(strSQL,parametros);

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
        //const {periodo,id_anfitrion,documento_id,cod,serie,num} = req.params;
        const { periodo, id_anfitrion, documento_id, cod, serie, numero } = req.body;
        let strSQL;
        let result;
        let result2;

        strSQL = `UPDATE mst_movimientodet SET registrado = 0
                  WHERE periodo = $1
                  AND id_usuario = $2
                  AND documento_id = $3
                  AND cod = $4
                  AND serie = $5
                  AND numero = $6`;
        result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,numero]);

        strSQL = `UPDATE mst_movimiento SET registrado = 0
                  WHERE periodo = $1
                  AND id_usuario = $2
                  AND documento_id = $3
                  AND cod = $4
                  AND serie = $5
                  AND numero = $6
                  RETURNING *`;
        result2 = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,numero]);
        console.log(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,numero]);
        //return res.sendStatus(204);
      // Si la función devolvió resultados, enviarlos al frontend
      if (result2.rows.length > 0) {
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
    }
};

const generarSaldosIniciales = async (req, res, next) => {
  const { periodo, id_anfitrion, documento_id } = req.body;

  // Calcula el siguiente periodo automáticamente
  const [anio, mes] = periodo.split('-').map(Number);
  const siguientePeriodo =
    mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, '0')}`;

  try {
    await pool.query('BEGIN');

    // 🧹 1️⃣ Eliminar saldos existentes del siguiente periodo
    const deleteSQL = `
      DELETE FROM mst_producto_sf
      WHERE id_usuario = $1
        AND documento_id = $2
        AND periodo = $3
    `;
    await pool.query(deleteSQL, [id_anfitrion, documento_id, siguientePeriodo]);

    // 📦 2️⃣ Insertar nuevos saldos
    const insertSQL = `
      INSERT INTO mst_producto_sf (
        id_usuario, documento_id, id_producto, id_almacen, periodo, cantidad, descripcion, cont_und, peso_neto
      )
      SELECT 
        $2 AS id_usuario,
        $3 AS documento_id,
        f.id_producto,
        f.id_almacen,
        $4 AS periodo,
        (coalesce(f.saldo_inicial,0) + coalesce(f.ingresos,0) - coalesce(f.egresos,0)) AS cantidad,
        f.nombre_producto,
        f.cont_und,
        0 AS peso_neto
      FROM fst_inventario_avanzado_fecha($1, $2, $3, '', '', NULL) AS f
      WHERE (coalesce(f.saldo_inicial,0) + coalesce(f.ingresos,0) - coalesce(f.egresos,0)) <> 0
    `;

    await pool.query(insertSQL, [
      periodo,
      id_anfitrion,
      documento_id,
      siguientePeriodo
    ]);

    await pool.query('COMMIT');

    res.json({
      ok: true,
      mensaje: `✅ Saldos iniciales del periodo ${siguientePeriodo} generados correctamente (anteriores reemplazados).`,
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error en generarSaldosIniciales:', error);
    next(error);
  } finally {
    pool.release();
  }
};

const obtenerTotalUnidadesStocks = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;

  if (!periodo || !id_anfitrion || !documento_id || dia === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parámetros requeridos: periodo, id_anfitrion, id_invitado o dia',
    });
  }

  // Si no es "*", formatear a YYYY-MM-DD, si es "*", será null
  const fechaFiltro = dia !== '*' ? `${periodo}-${dia}` : null;

  try {
    const query = `
      SELECT consulta.*, 
            (CASE 
              WHEN $5 = '*' THEN $1
              ELSE 'DIA: ' || $5 
            END)::varchar AS emision
      FROM (
        SELECT 
          descripcion, 
          id_producto,
          cont_und,
          sum(precio_neto)::numeric(14,2) AS precio_neto,
          sum(ingreso)::numeric(14,2) AS ingreso,
          sum(egreso)::numeric(14,2) AS egreso
        FROM mst_movimientodet
        WHERE periodo = $1
          AND id_usuario = $2
          AND documento_id = $3
          AND ($4::date IS NULL OR r_fecemi = $4::date)
          AND registrado = 1
        GROUP BY descripcion, 
              id_producto,
              cont_und
      ) AS consulta
      ORDER BY descripcion
    `;

    const params = [periodo, id_anfitrion, documento_id, fechaFiltro, dia];

    const ventaResult = await pool.query(query, params);

    res.status(200).json({
      success: true,
      data: ventaResult.rows
    });

  } catch (error) {
    console.error('Error al obtener total de unidades:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
};


module.exports = {
    obtenerRegistroTodos,
    obtenerMotivos, //Motivos de movimientos Almacen
    obtenerInventario, //New Reporte ;)
    obtenerKardex, //New reporte ;)
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
    obtenerTotalUnidadesStocks,
    generarSaldosIniciales //New para generar saldos
 }; 