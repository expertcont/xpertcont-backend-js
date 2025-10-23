const pool = require('../db');

const obtenerVentaDetTodos = async (req, res, next) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;
  //console.log(periodo, id_anfitrion, documento_id, dia);

  const fechaFiltro = dia !== '*' ? `${periodo}-${dia}` : null;

  // Definición compacta de columnas
  const columnas = `
    CAST(mve_ventadet.r_fecemi AS VARCHAR(50)) AS r_fecemi,
    mve_ventadet.r_cod,
    mve_ventadet.r_serie,
    mve_ventadet.r_numero,
    (COALESCE(mve_ventadet.r_cod_ref, r_cod) || '-' ||
      COALESCE(mve_ventadet.r_serie_ref, r_serie) || '-' ||
      COALESCE(mve_ventadet.r_numero_ref, r_numero))::VARCHAR(50) AS comprobante,
    mve_venta.r_id_doc,
    mve_venta.r_documento_id,
    mve_venta.r_razon_social,
    mve_ventadet.id_almacen,
    mve_ventadet.id_producto,
    mve_ventadet.descripcion,
    mve_ventadet.cantidad,
    mve_ventadet.cont_und,
    mve_ventadet.precio_neto,
    mve_ventadet.porc_igv
  `;

  let query = `
    SELECT ${columnas}
    FROM 
    mve_ventadet INNER JOIN mve_venta
    ON (mve_ventadet.periodo = mve_venta.periodo and
        mve_ventadet.id_usuario = mve_venta.id_usuario and
        mve_ventadet.documento_id = mve_venta.documento_id and
        mve_ventadet.r_cod = mve_venta.r_cod and
        mve_ventadet.r_serie = mve_venta.r_serie and
        mve_ventadet.r_numero = mve_venta.r_numero and
        mve_ventadet.elemento = mve_venta.elemento )
        )
    WHERE mve_ventadet.periodo = $1
      AND mve_ventadet.id_usuario = $2
      AND mve_ventadet.documento_id = $3
      AND mve_ventadet.r_cod <> 'NP'
  `;

  const params = [periodo, id_anfitrion, documento_id];

  if (fechaFiltro) {
    query += " AND mve_ventadet.r_fecemi = $4";
    params.push(fechaFiltro);
  }

  query += " ORDER BY mve_ventadet.r_fecemi DESC, mve_ventadet.r_cod, mve_ventadet.r_serie, mve_ventadet.r_numero DESC";

  //console.log("SQL:", query, "PARAMS:", params);

  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error("Error en obtenerRegistroTodos:", error.message);
    next(error);
  }
};

const obtenerVentaDet = async (req,res,next)=> {
    //Detalles de un Pedido
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,elem} = req.params;
        let strSQL;
        strSQL = "SELECT * ";
        strSQL += " FROM mve_ventadet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        strSQL += " ORDER BY item";
        //console.log(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem]);
        
        const result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem]);
        
        //eSTE MENSAJE DE VENTGA NO ENCONTRADA, CONFUNDE AL BUCLE PARA RENDERIZAR LOS DATOS
        //MEJOR QUE SALGA ARRAY VACIO, AL MENOS ASI ENTIENDE QUE NO HAY NADA
        /*if (result.rows.length === 0)
            return res.status(404).json({
                message:"Venta no encontrada"
            });*/

        //res.json(result.rows[0]);
        res.json(result.rows);
    } catch (error) {
        console.log(error.message);
    }
};

const obtenerVentaDetItem = async (req,res,next)=> {
    //DEtalles de un Pedido
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,elem,item} = req.params;
        let strSQL ;
        strSQL = "SELECT * ";
        strSQL += " FROM mve_ventadet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        strSQL += " AND item = $8";
        strSQL += " ORDER BY item";
        //console.log(strSQL,[cod,serie,num,elem,item]);
        
        const result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem,item]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Item no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearVentaDet = async (req,res,next)=> {
    const values = [
        req.body.id_anfitrion,      //01
        req.body.documento_id,      //02
        req.body.periodo,           //03
        req.body.r_cod,             //04
        req.body.r_serie,           //05
        req.body.r_numero,          //06
        req.body.elemento,          //07
        req.body.r_fecemi,          //08
        req.body.id_producto,       //09
        req.body.descripcion,       //10
        req.body.cantidad,          //11
        req.body.precio_unitario,   //12
        req.body.precio_neto,       //13
        req.body.porc_igv,          //14
        req.body.cont_und           //15
    ];
        
    const strSQL = `
        SELECT public.fve_ventadetinserta(
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        ) AS resultado;
        `;

    try {
        // Ejecuta la consulta a la función de PostgreSQL
        console.log(strSQL, values);

        const result = await pool.query(strSQL, values);
        const resultado = result.rows[0].resultado;
        
        console.log(resultado);
        // Si la operación fue exitosa, devolver true
        if (resultado) {
            return res.status(200).json({ success: true });
        } else{
            return res.status(400).json({ success: false });
        }
    } catch (error) {
        console.error('Error ejecutando la función:', error);
        // Si hay un error en la base de datos o backend, devuelve false
        return res.status(500).json({ success: false });
    }
};

const eliminarVentaDet = async (req,res,next)=> {
    const values = [
        req.params.id_anfitrion,      //01
        req.params.documento_id,      //02
        req.params.periodo,           //03
        req.params.cod,             //04
        req.params.serie,           //05
        req.params.num,          //06
        req.params.elem,          //07
        req.params.item               //08
    ];
        
    const strSQL = `
        SELECT public.fve_ventadetelimina(
            $1, $2, $3, $4, $5, $6, $7, $8
        ) AS resultado;
        `;
    //console.log(strSQL);
    //console.log(values);
    try {
        // Ejecuta la consulta a la función de PostgreSQL
        const result = await pool.query(strSQL, values);
        const resultado = result.rows[0].resultado;

        // Si la operación fue exitosa, devolver true
        if (resultado) {
            return res.status(200).json({ success: true });
        } else{
            return res.status(400).json({ success: false });
        }
    } catch (error) {
        console.error('Error ejecutando la función:', error);
        // Si hay un error en la base de datos o backend, devuelve false
        return res.status(500).json({ success: false });
    }
};

const actualizarVentaDet = async (req,res,next)=> {
    const values = [
        req.params.id_anfitrion,    //01
        req.params.documento_id,    //02
        req.params.periodo,         //03
        req.params.cod,             //04
        req.params.serie,           //05
        req.params.num,             //06
        req.params.elem,            //07
        req.params.item,            //08
        
        req.body.descripcion,       //09
        req.body.cantidad,          //10
        req.body.precio_unitario,   //11
        req.body.precio_neto        //12
    ];
        
    const strSQL = `
        SELECT public.fve_ventadetactualiza(
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        ) AS resultado;
        `;

    try {
        // Ejecuta la consulta a la función de PostgreSQL
        const result = await pool.query(strSQL, values);
        const resultado = result.rows[0].resultado;

        // Si la operación fue exitosa, devolver true
        if (resultado) {
            return res.status(200).json({ success: true });
        } else{
            return res.status(400).json({ success: false });
        }
    } catch (error) {
        console.error('Error ejecutando la función:', error);
        // Si hay un error en la base de datos o backend, devuelve false
        return res.status(500).json({ success: false });
    }
};

/*const eliminarVentaDet = async (req,res,next)=> {
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,elem,item} = req.params;
        let strSQL;
        strSQL = "DELETE FROM mve_ventadet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        if (item!="-"){
            strSQL += " AND item = $8";
            const result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem,item]);
        }else{
            const result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem]);
        }

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Venta no encontrada"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};*/

/*const actualizarVentaDet = async (req,res,next)=> {
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,elem,item} = req.params; //08 parametros
        const { 
                id_producto,        //09
                descripcion,        //10
                precio_unitario,    //11
                porc_igv,           //12
                cantidad,           //13
                unidad_medida,      //14
                fecha_entrega2,     //15
                moneda              //16
            } = req.body        
 
        let strSQL;
        strSQL = "UPDATE mve_ventadet SET ";
        strSQL += " ,id_producto = $5";
        strSQL += " ,descripcion = $6";
        strSQL += " ,precio_unitario = $7";
        strSQL += " ,porc_igv = $8";
        strSQL += " ,cantidad = $9";
        strSQL += " ,unidad_medida = $12";
        strSQL += " ,fecha_entrega = $13";
        strSQL += " ,moneda = $14";

        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        strSQL += " AND item = $8";
 
        const result = await pool.query(strSQL,
        [   
            periodo,        //01
            id_anfitrion,   //02
            documento_id,   //03
            cod,            //04
            serie,          //05
            num,            //06
            elem,           //07
            item,           //08

            id_producto,        //05
            descripcion,        //06
            precio_unitario,    //07
            porc_igv,           //08
            cantidad,           //09
            unidad_medida,      //12
            fecha_entrega2,     //13
            moneda,     //14 new
        ]
        );

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Detalle de venta no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};*/

module.exports = {
    obtenerVentaDetTodos,
    obtenerVentaDet,
    obtenerVentaDetItem,
    crearVentaDet,
    eliminarVentaDet,
    actualizarVentaDet
 }; 