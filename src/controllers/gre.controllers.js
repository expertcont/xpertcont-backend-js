const pool = require('../db');
const {devuelveCadenaNull,devuelveNumero, convertirFechaString, convertirFechaStringComplete, corregirTCPEN, corregirMontoNotaCredito} = require('../utils/libreria.utils');
const fetch = require('node-fetch');

const obtenerRegistroGreTodos = async (req, res, next) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;
  console.log(periodo, id_anfitrion, documento_id, dia);

  const fechaFiltro = dia !== '*' ? `${periodo}-${dia}` : null;

  // Definición compacta de columnas
  const columnas = `
    CAST(fecha_emision AS VARCHAR(50)) AS fecha_emision,
    CAST(fecha_traslado AS VARCHAR(50)) AS fecha_traslado,
    cod,
    serie,
    numero,
    (cod || '-' ||
      serie || '-' ||
      numero)::VARCHAR(50) AS gre,
    destinatario_ruc_dni,
    detinatario_razon_social,
    glosa,
    vfirmado,
    (ref_cod || '-' ||
      ref_serie || '-' ||
      ref_numero )::VARCHAR(50) AS ref_venta
  `;

  let query = `
    SELECT ${columnas}
    FROM mve_gre
    WHERE periodo = $1
      AND id_usuario = $2
      AND documento_id = $3
  `;

  const params = [periodo, id_anfitrion, documento_id];

  if (fechaFiltro) {
    query += " AND fecha_emision = $4";
    params.push(fechaFiltro);
  }

  query += " ORDER BY cod, serie, numero DESC";

  console.log("SQL:", query, "PARAMS:", params);

  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error("Error en obtenerRegistroTodos:", error.message);
    next(error);
  }
};

const obtenerRegistroGre = async (req,res,next)=> {
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num} = req.params;
        let strSQL ;
        
        strSQL = "SELECT mve_gre.* ";
        strSQL += " ,cast(mve_gre.fecha_emision as varchar)::varchar(50) as fecha_emision";
        strSQL += " ,cast(mve_gre.hora_emision as varchar)::varchar(50) as hora_emision";
        strSQL += " ,cast(mve_gre.fecha_traslado as varchar)::varchar(50) as fecha_traslado";
        strSQL += " ,mad_usuariocontabilidad.razon_social";   //dato para impresion
        strSQL += " ,mad_usuariocontabilidad.direccion";      //dato para impresion
        strSQL += " ,mad_usuariocontabilidad.ubigeo";         //dato para impresion
        strSQL += " ,mad_usuariocontabilidad.distrito";       //dato para impresion
        strSQL += " ,mad_usuariocontabilidad.provincia";      //dato para impresion
        strSQL += " ,mad_usuariocontabilidad.departamento";   //dato para impresion
        strSQL += " FROM";
        strSQL += " mve_gre LEFT JOIN mad_usuariocontabilidad";
        strSQL += " ON (mve_gre.id_usuario = mad_usuariocontabilidad.id_usuario and";
        strSQL += "     mve_gre.documento_id = mad_usuariocontabilidad.documento_id and";
        strSQL += "     'ADMIN' = mad_usuariocontabilidad.tipo)";
        strSQL += " WHERE mve_gre.periodo = $1";
        strSQL += " AND mve_gre.id_usuario = $2";
        strSQL += " AND mve_gre.documento_id = $3";
        strSQL += " AND mve_gre.cod = $4";
        strSQL += " AND mve_gre.serie = $5";
        strSQL += " AND mve_gre.numero = $6";
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
        id_anfitrion,             //01
        documento_id,             //02
        periodo,                  //03
        cod,                      //04
        serie,                    //05
        //r_numero,       //generado
        fecha_emision,            //06
        hora_emision,             //07
        fecha_traslado,           //08
        
        guia_motivo_id,           //09
        guia_modalidad_id,        //10
        
        partida_ubigeo,           //11
        partida_direccion,        //12
        llegada_ubigeo,           //13
        llegada_direccion,        //14
        peso_total,               //15

        transp_ruc,               //16
        transp_razon_social,      //17

        conductor_dni,            //18
        conductor_nombres,        //19
        conductor_apellidos,      //20
        conductor_licencia,       //21
        vehiculo_placa,           //22

        destinatario_tipo,        //23
        destinatario_ruc_dni,     //24
        destinatario_razon_social,  //25
        
        ctrl_crea_us,             //26
        ref_cod,                  //27 ref opcional venta
        ref_serie,                //28 ref opcional venta
        ref_numero,               //29 ref opcional venta
        
    } = req.body;

    //cuando llega con dd/mm/yyyy o dd-mm-yyyy hay que invertir el orden, sino sale invalido
    
    strSQL = "INSERT INTO mve_gre";
    strSQL +=  " (";
    strSQL += "  id_usuario";                 //01
    strSQL += " ,documento_id";               //02
    strSQL += " ,periodo";                    //03
    strSQL += " ,cod";                        //04
    strSQL += " ,serie";                      //05
    strSQL += " ,numero";                     //generado *
    strSQL += " ,fecha_emision";              //06
    strSQL += " ,hora_emision";               //07
    strSQL += " ,fecha_traslado";             //08

    strSQL += " ,guia_motivo_id";             //09
    strSQL += " ,guia_modalidad_id";          //10

    strSQL += " ,partida_ubigeo";             //11
    strSQL += " ,partida_direccion";          //12
    strSQL += " ,llegada_ubigeo";             //13
    strSQL += " ,llegada_direccion";          //14
    strSQL += " ,peso_total";                 //15

    strSQL += " ,transp_ruc";                 //16
    strSQL += " ,transp_razon_social";        //17

    strSQL += " ,conductor_dni";              //18
    strSQL += " ,conductor_nombres";          //19
    strSQL += " ,conductor_apellidos";        //20
    strSQL += " ,conductor_licencia";         //21
    strSQL += " ,vehiculo_placa";             //22

    strSQL += " ,destinatario_tipo";          //23
    strSQL += " ,destinatario_ruc_dni";       //24
    strSQL += " ,destinatario_razon_social";  //25

    strSQL += " ,ctrl_crea";                  //generado *
    strSQL += " ,ctrl_crea_us";               //26

    strSQL += " ,ref_cod";                    //27
    strSQL += " ,ref_serie";                  //28
    strSQL += " ,ref_numero";                 //29
    
    strSQL += " )";
    strSQL += " VALUES";
    strSQL += " (";
    strSQL += "  $1";
    strSQL += " ,$2";
    strSQL += " ,$3";
    //Fact,Bol,Pedidos,etc
    strSQL += " ,$4";
    strSQL += " ,$5";
    strSQL += " ,(select * from fve_genera_gre($1,$2,$4,$5))"; //elementos pkey ... body
    
    strSQL += " ,$6";
    strSQL += " ,$7";
    strSQL += " ,$8"; 

    strSQL += " ,$9";
    strSQL += " ,$10";

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
    strSQL += " ,CURRENT_TIMESTAMP"; //ctrl_crea

    strSQL += " ,$26";
    strSQL += " ,$27";
    strSQL += " ,$28";
    strSQL += " ,$29";
    strSQL += " ) RETURNING *";

    try {
        //console.log(strSQL);
        const parametros = [   
            id_anfitrion,   //01
            documento_id,   //02
            periodo,        //03
            cod,            //04
            serie,          //05
            devuelveCadenaNull(fecha_emision),            //06
            devuelveCadenaNull(hora_emision),             //07
            devuelveCadenaNull(fecha_traslado),           //08
            devuelveCadenaNull(guia_motivo_id),           //09
            devuelveCadenaNull(guia_modalidad_id),        //10
            
            devuelveCadenaNull(partida_ubigeo),           //11
            devuelveCadenaNull(partida_direccion),        //12
            devuelveCadenaNull(llegada_ubigeo),           //13
            devuelveCadenaNull(llegada_direccion),        //14
            devuelveCadenaNull(peso_total),               //15

            devuelveCadenaNull(transp_ruc),               //16
            devuelveCadenaNull(transp_razon_social),      //17

            devuelveCadenaNull(conductor_dni),            //18
            devuelveCadenaNull(conductor_nombres),        //19
            devuelveCadenaNull(conductor_apellidos),      //20
            devuelveCadenaNull(conductor_licencia),       //21
            devuelveCadenaNull(vehiculo_placa),           //22

            devuelveCadenaNull(destinatario_tipo),        //23
            devuelveCadenaNull(destinatario_ruc_dni),     //24
            devuelveCadenaNull(destinatario_razon_social),  //25
            devuelveCadenaNull(ctrl_crea_us),             //26
            
            devuelveCadenaNull(ref_cod),      //27
            devuelveCadenaNull(ref_serie),    //28
            devuelveCadenaNull(ref_numero),   //29
        ];
        //console.log(parametros);
        const result = await pool.query(strSQL, parametros);
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const eliminarRegistro = async (req,res,next)=> {
  //Clonamos cualquier registro(Bol,Fact,NotaVenta) y lo convertimos a Nota en Proceso
  //Luego se habilida Emitir en otro comprobante (Aprovechamos disponibilidad para notas credito)
  const { periodo, id_anfitrion, documento_id, r_cod, r_serie, r_numero } = req.body;

  try {
    console.log([periodo, id_anfitrion, documento_id, r_cod, r_serie, r_numero, elemento]);
    // Ejecutar la función fve_crear_pedido en PostgreSQL
    const result = await pool.query(
      `SELECT fve_eliminar_gre($1, $2, $3, $4, $5, $6)::boolean AS success`,
      [periodo, id_anfitrion, documento_id, r_cod, r_serie, r_numero]
    );

    //console.log('result.rowCount: ',result.rows[0]);
    //console.log('result.rows[0].success: ',result.rows[0].success);

    if (!result.rows[0].success) {
        return res.status(200).json({
            success:false,
            message:"GRe no encontrada"
        });
    }else{
        return res.status(200).json({
          success:true,
          message:"GRE eliminada"
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
        strSQL = "DELETE FROM mve_gredet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
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

const actualizarRegistro = async (req,res,next)=> {
    try {
        const { 
          periodo,        //01
          id_anfitrion,   //02
          documento_id,   //03    
          cod,          //04
          serie,        //05
          numero,       //06
          
          fecha_emision,            //07
          fecha_traslado,           //08
          
          guia_motivo_id,           //09
          guia_modalidad_id,        //10
          
          partida_ubigeo,           //11
          partida_direccion,        //12
          llegada_ubigeo,           //13
          llegada_direccion,        //14
          peso_total,               //15

          transp_ruc,               //16
          transp_razon_social,      //17

          conductor_dni,            //18
          conductor_nombres,        //19
          conductor_apellidos,      //20
          conductor_licencia,       //21
          vehiculo_placa,           //22

          destinatario_tipo,        //23
          destinatario_ruc_dni,     //24
          destinatario_razon_social,  //25
          
          id_invitado,        //26

        } = req.body;
        //faltan mas parametros de razon social ruc y direccion
    
        let strSQL;
        let result;

        const parametros = [   
            //Seccion parametros
            periodo,            //01
            id_anfitrion,       //02
            documento_id,       //03
            cod,              //04
            serie,            //05
            numero,           //06

            devuelveCadenaNull(fecha_emision),          //07
            devuelveCadenaNull(fecha_traslado),       //08
            devuelveCadenaNull(guia_motivo_id),           //09
            devuelveCadenaNull(guia_modalidad_id),        //10
            
            devuelveCadenaNull(partida_ubigeo),           //11
            devuelveCadenaNull(partida_direccion),        //12
            devuelveCadenaNull(llegada_ubigeo),           //13
            devuelveCadenaNull(llegada_direccion),        //14
            devuelveCadenaNull(peso_total),               //15

            devuelveCadenaNull(transp_ruc),               //16
            devuelveCadenaNull(transp_razon_social),      //17

            devuelveCadenaNull(conductor_dni),            //18
            devuelveCadenaNull(conductor_nombres),        //19
            devuelveCadenaNull(conductor_apellidos),      //20
            devuelveCadenaNull(conductor_licencia),       //21
            devuelveCadenaNull(vehiculo_placa),           //22

            devuelveCadenaNull(destinatario_tipo),        //23
            devuelveCadenaNull(destinatario_ruc_dni),     //24
            devuelveCadenaNull(destinatario_razon_social),  //25

            id_invitado                 //26
        ];

        strSQL = `UPDATE mve_gre SET 
                         fecha_emision = $7
                        ,fecha_traslado = $8
                        ,guia_motivo_id = $9
                        ,guia_modalidad_id = $10
                        
                        ,partida_ubigeo = $11
                        ,partida_direccion = $12
                        ,llegada_ubigeo = $13
                        ,llegada_direccion = $14
                        ,peso_total = $15

                        ,transp_ruc = $16
                        ,transp_razon_social = $17

                        ,conductor_dni = $18
                        ,conductor_nombres = $19
                        ,conductor_apellidos = $20
                        ,conductor_licencia = $21
                        ,vehiculo_placa = $22

                        ,destinatario_tipo = $23
                        ,destinatario_ruc_dni = $24
                        ,destinatario_razon_social = $25

                        ,ctrl_mod_us = $26
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


//Section Power: Api propio/////////////////////////////////////////////////
const generarGREexpertcont = async (req,res,next)=> {
    //Consumo mi propio API ;) thanks
    const {
        p_periodo,
        p_id_usuario,
        p_documento_id,
        p_r_cod,
        p_r_serie,
        p_r_numero
      } = req.body;
      
      try {

        const jsonString = await generaJsonPrevioGREexpertcont(p_periodo,
                                        p_id_usuario,
                                        p_documento_id,
                                        p_r_cod,
                                        p_r_serie,
                                        p_r_numero);
        
        console.log('jsonString armado: ',jsonString);

        // 5. Enviar JSON a la API 
        const strUrlApi = "https://expertcont-api-sunat.up.railway.app/gresunat";
        
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
          } = responseData;
        
          // Extraer directamente el valor del segundo elemento del objeto `codigo_hash`
          console.log('codigo_hash: ',codigo_hash);

          if (codigo_hash !== null){
              // 2. Lectura de datos de la tabla mve_venta, solo en modo producccion, nada que ver con confucio ;)
              const data = JSON.parse(jsonString);
              if (data.empresa.modo === "1") {
                  await pool.query(
                    `
                    UPDATE mve_gre set vfirmado = $7
                    WHERE periodo = $1 AND id_usuario = $2 AND documento_id = $3
                      AND cod = $4 AND serie = $5 AND numero = $6 
                    `,
                    [p_periodo, p_id_usuario, p_documento_id, p_r_cod, p_r_serie, p_r_numero, codigo_hash]
                  );
              }
          }

          return res.json({
            respuesta_sunat_descripcion,
            ruta_xml,
            ruta_cdr,
            ruta_pdf,
            codigo_hash, // Incluye el nuevo campo en la respuesta
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

const generaJsonPrevioGREexpertcont = async( p_periodo,
                            p_id_usuario,
                            p_documento_id,
                            p_r_cod,
                            p_r_serie,
                            p_r_numero) => {
        // 1. Lectura de datos de la tabla mad_usuario_contabilidad, incluido el modo Produccion o Beta
        const datosQuery = await pool.query(
          `
          SELECT * FROM mad_usuariocontabilidad
          WHERE id_usuario = $1 AND documento_id = $2 AND tipo = 'ADMIN'
          `,
          [p_id_usuario, p_documento_id]
        );
        const datos = datosQuery.rows[0];
        if (!datos) {
          console.log("CONTABILIDAD NO ENCONTRADA");
          return "CONTABILIDAD NO ENCONTRADA";
          //return res.status(404).json({ error: "Datos de usuario no encontrados" });
        }
        
        // 2. Lectura de datos de la tabla mve_venta
        const registroQuery = await pool.query(
          `
          SELECT * FROM mve_gre
          WHERE periodo = $1 AND id_usuario = $2 AND documento_id = $3
            AND cod = $4 AND serie = $5 AND numero = $6
          `,
          [p_periodo, p_id_usuario, p_documento_id, p_r_cod, p_r_serie, p_r_numero]
        );
        const registro = registroQuery.rows[0];
        if (!registro) {
          console.log("GRE NO ENCONTRADA");
          return "GRE NO ENCONTRADA";
          //return res.status(404).json({ error: "Datos de venta no encontrados" });
        }
    
        // 3. Lectura de datos de la tabla mve_gredet (es mejor y rapido la lectura de tabla guias, no del universo de ventasdet ;) ... )
        const regdetQuery = await pool.query(
          `
          SELECT * FROM mve_gredet
          WHERE periodo = $1 AND id_usuario = $2 AND documento_id = $3
            AND cod = $4 AND serie = $5 AND numero = $6
          `,
          [p_periodo, p_id_usuario, p_documento_id, p_r_cod, p_r_serie, p_r_numero]
        );
        const regdet = regdetQuery.rows;
    
        // 4. Construir el JSON, 
        //Esto va para Bearer
        //token:datos.token_factintegral,
        //console.log(regdet);

        const jsonPayload = {
          empresa: {
            ruc: datos.documento_id,
            razon_social: datos.razon_social,
            nombre_comercial: datos.razon_social,
            domicilio_fiscal: datos.direccion,
            ubigeo: datos.ubigeo,
            distrito: datos.distrito,
            provincia: datos.provincia,
            departamento: datos.departamento,
            modo: datos.modo, //NEW cuidado ...  0: prueba  1:produccion, pero en guias creo q no hay modo prueba
          },
          guia: {
            cod: registro.cod,
            serie: registro.serie,
            numero: registro.numero,
            fecha_emision: registro.fecha_emision.toISOString().split("T")[0],
            fecha_traslado: registro.fecha_traslado.toISOString().split("T")[0],
            guia_motivo_id: registro.guia_motivo_id,
            guia_modalidad_id: registro.guia_modalidad_id,
            
            transp_ruc: registro.transp_ruc,
            transp_razon_social: registro.transp_razon_social,
            conductor_dni: registro.conductor_dni,
            conductor_nombres: registro.conductor_nombres,
            conductor_apellidos: registro.conductor_apellidos,
            conductor_licencia: registro.conductor_licencia,
            vehiculo_placa: registro.vehiculo_placa,

            destinatario_tipo: registro.destinatario_tipo,
            destinatario_ruc_dni: registro.destinatario_ruc_dni,
            destinatario_razon_social: registro.destinatario_razon_social,
            
            partida_ubigeo: registro.partida_ubigeo,
            partida_direccion: registro.partida_direccion,
            llegada_ubigeo: registro.llegada_ubigeo,
            llegada_direccion: registro.llegada_direccion,
            
            peso_total: registro.peso_total,
          },
          items: regdet.map((item) => ({
            cantidad: item.cantidad,
            producto: item.descripcion,
            codigo: item.id_producto,
            codigo_unidad: item.cont_und,
          })),
        };

        const jsonString = JSON.stringify(jsonPayload, null, 2); // Genera un JSON válido
        return (jsonString);
};

const crearRegistroRef = async (req, res, next) => {
    //Crea registro en BB con referencia de venta individual
    //Proc almacenado: Recibe json con datos de cabecera y en tabla mve_ventadet productos
    let strSQL;
    const { periodo, id_anfitrion, documento_id, id_invitado, cod_emitir } = req.params;

    const datos = req.body;
    //console.log(datos);

    const datosJSON = JSON.stringify(datos);
    //console.log(datosJSON,periodo, id_anfitrion, documento_id, id_invitado, cod_emitir);
    strSQL = "SELECT cod, serie, numero FROM fve_generagrejson($1, $2, $3, $4, $5, $6)";
    try {
        const parametros = [datosJSON, id_anfitrion, documento_id, periodo, id_invitado, cod_emitir];
        const result = await pool.query(strSQL, parametros);
        console.log('Gre creada en BD');
        if (result.rows.length > 0) {
          res.status(200).json({
            success: true,
            ... result.rows[0], // Devolver el primer (y único) resultado
          });
        } else {
          res.status(404).json({
            success: false,
            message: 'No se encontraron resultados o no se pudo registrar gre relacionada',
          });
        }

        //res.json({ success: result.rows[0].resultado });
    } catch (error) {
        console.log('Gre BD hubo un problema: ', error.message);
        res.json({ success: false });
    }
};

const obtenerUbigeos = async (req, res, next) => {
  // Definición compacta de columnas
  const columnas = `
    id_catalogo as codigo,
    nombre as descripcion,
    '-'::varchar(2) as auxiliar
  `;

  let query = `
    SELECT ${columnas}
    FROM mct_ubigeo
    ORDER BY nombre
  `;

  try {
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error("Error en obtener Ubigeos:", error.message);
    next(error);
  }
};

module.exports = {
    obtenerRegistroGreTodos,
    obtenerRegistroGre,
    crearRegistro,
    crearRegistroRef,
    eliminarRegistro,
    eliminarRegistroItem,
    actualizarRegistro,
    generarGREexpertcont,
    obtenerUbigeos
 }; 