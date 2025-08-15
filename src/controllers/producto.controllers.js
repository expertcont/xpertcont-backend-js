const pool = require('../db');
const xlsx = require('xlsx');
const { Readable } = require('stream');
//const {devuelveCadenaNull,devuelveNumero, convertirFechaString, convertirFechaStringComplete, corregirTCPEN, corregirMontoNotaCredito} = require('../utils/libreria.utils');
const { from: copyFrom } = require('pg-copy-streams');
const { pipeline } = require('node:stream/promises');

const obtenerTodosProductos = async (req,res,next)=> {
    try {
        //console.log(req.params);
        let strSQL;
        const {id_anfitrion,documento_id} = req.params;
        strSQL = "SELECT "
        strSQL += " id_producto";   //03
        strSQL += ",nombre";        //04
        strSQL += ",descripcion";   //05
        strSQL += ",precio_venta";  //06
        strSQL += ",cont_und";      //07
        strSQL += ",porc_igv";      //08
        strSQL += ",origen";        //09
        strSQL += ",(precio_venta || '-' || cont_und || '-' || porc_igv )::varchar as auxiliar";
        strSQL += " FROM mst_producto";   //03

        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " ORDER BY id_producto";
        //console.log(strSQL,[id_usuario,documento_id]);
        const todosRegistros = await pool.query(strSQL,[id_anfitrion,documento_id]);
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }
    //res.send('Listado de todas los zonas');
};

const obtenerTodosProductosPrecios = async (req,res,next)=> {
    try {
        //console.log(req.params);
        //creo que auqi, debemos consultar si esta activado el precio por factor (por cantidad)

        //si es positivo precio por cantidad, entonces 
        let strSQL;
        const {id_anfitrion,documento_id} = req.params;
        strSQL = "SELECT "
        strSQL += " mst_producto_precio.id_producto";   //01
        strSQL += ",mst_producto.nombre";               //02
        strSQL += ",mst_producto_precio.unidades as descripcion";      //03
        strSQL += ",mst_producto_precio.precio_venta";  //04
        strSQL += ",mst_producto_precio.cant_min";      //05
        strSQL += ",mst_producto_precio.cant_max";      //06
        strSQL += ",mst_producto_precio.origen";        //07
        strSQL += " FROM ";
        strSQL += " mst_producto INNER JOIN mst_producto_precio";
        strSQL += " ON (mst_producto.id_usuario = mst_producto_precio.id_usuario and ";
        strSQL += "     mst_producto.documento_id = mst_producto_precio.documento_id and ";
        strSQL += "     mst_producto.id_producto = mst_producto_precio.id_producto ) ";
        strSQL += " WHERE mst_producto_precio.id_usuario = $1";
        strSQL += " AND mst_producto_precio.documento_id = $2";
        strSQL += " ORDER BY mst_producto.id_producto";
        console.log(strSQL,[id_anfitrion,documento_id]);
        const todosRegistros = await pool.query(strSQL,[id_anfitrion,documento_id]);
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }
    //res.send('Listado de todas los zonas');
};

const obtenerPreciosProducto = async (req,res,next)=> {
    try {
        //si es positivo precio por cantidad, entonces 
        let strSQL;
        const {id_anfitrion,documento_id,id_producto} = req.params;
        strSQL = `SELECT 
                     unidades
                    ,precio_venta
                    ,cant_min
                    ,cant_max
                  FROM mst_producto_precio
                  WHERE id_usuario = $1
                  AND documento_id = $2
                  AND id_producto = $3
                  ORDER BY id_producto`;
        const todosRegistros = await pool.query(strSQL,[id_anfitrion,documento_id,id_producto]);
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }
    //res.send('Listado de todas los zonas');
};

const obtenerTodosProductosPopUp = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id} = req.params;

        // Consultar si está activado el parámetro
        const configRes = await pool.query(
        `SELECT precio_factor FROM mve_parametros 
        WHERE id_usuario = $1
        AND documento_id = $2`,  // corregido aquí
        [id_anfitrion, documento_id]
        );

        // Asegura que el valor null no rompa la lógica
        const valor = configRes.rows[0]?.precio_factor;
        const precioFactor = valor === '1' ? '1' : '0';
        console.log('precioFactor: ', precioFactor);
        if (precioFactor === '0') {
            strSQL = `SELECT 
                         id_producto as codigo
                        ,nombre as descripcion
                        ,(precio_venta || '-' || cont_und || '-' || porc_igv || '-' || $3::varchar )::varchar as auxiliar
                    FROM mst_producto
                    WHERE id_usuario = $1
                    AND documento_id = $2
                    ORDER BY nombre`;
        }else{
            strSQL = `SELECT 
                         mst_producto_precio.id_producto as codigo
                        ,mst_producto.nombre as descripcion
                        ,(mst_producto_precio.precio_venta || '-' || mst_producto.cont_und || '-' || mst_producto.porc_igv || '-' || $3::varchar )::varchar as auxiliar
                        FROM
                        mst_producto INNER JOIN mst_producto_precio
                        ON (mst_producto.id_usuario = mst_producto_precio.id_usuario and
                            mst_producto.documento_id = mst_producto_precio.documento_id and
                            mst_producto.id_producto = mst_producto_precio.id_producto and
                            mst_producto_precio.unidades = 1)
                        WHERE mst_producto_precio.id_usuario = $1
                        AND mst_producto_precio.documento_id = $2
                        ORDER BY mst_producto.id_producto`;
        }

        const todosRegistros = await pool.query(strSQL,[id_anfitrion,documento_id,precioFactor]);
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerProducto = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id,id_producto} = req.params;

        strSQL = "select * from mst_producto "
        strSQL += " where id_usuario = $1";
        strSQL += " and documento_id = $2";
        strSQL += " and id_producto = $3";

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,id_producto]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Producto no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};
const obtenerProductoIgv = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id,id_producto} = req.params;
        strSQL = "select porc_igv from mst_producto "
        strSQL += " where id_usuario = $1";
        strSQL += " and documento_id = $2";
        strSQL += " and id_producto = $3";

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,id_producto]);

        if (result.rows.length === 0){
            res.json({porc_igv:"0.00"});
        };

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};
const obtenerParametrosVenta = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id} = req.params;
        strSQL = "select * from mve_parametros "
        strSQL += " where id_usuario = $1";
        strSQL += " and documento_id = $2";

        const result = await pool.query(strSQL,[id_anfitrion,documento_id]);
        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearProducto = async (req,res,next)=> {
    const { 
            id_anfitrion,     //01
            documento_id,   //02
            id_producto,    //03    
            nombre,         //04
            descripcion,    //05
            precio_venta,   //06
            cont_und,       //07
            origen,         //08
        } = req.body
    let strSQL;
    try {
        strSQL = "INSERT INTO mst_producto(";
        strSQL += " id_usuario";    //01
        strSQL += ",documento_id";  //02
        strSQL += ",id_producto";   //03
        strSQL += ",nombre";        //04
        strSQL += ",descripcion";   //05
        strSQL += ",precio_venta";  //06
        strSQL += ",cont_und";      //07
        strSQL += ",origen";        //08
        strSQL += ") VALUES ( ";

        strSQL += " $1,$2,$3,$4,$5,$6,$7,$8 ";
        strSQL += " ) RETURNING *";

        const result = await pool.query(strSQL, 
        [   
            id_anfitrion,     //01
            documento_id,   //02
            id_producto,    //03    
            nombre,         //04
            descripcion,    //05
            precio_venta,   //06
            cont_und,        //07
            origen,        //08
        ]
        );
        
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        console.log(error);
        next(error)
    }
};

const eliminarProducto = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id,id_producto} = req.params;
        strSQL = "DELETE FROM mst_producto "
        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " AND id_producto = $3";

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,id_producto]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Producto no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};
const actualizarProducto = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id,id_producto} = req.params; //03
        const { nombre,         //04
                descripcion,    //05
                precio_venta,   //06
                porc_igv,       //07
                cont_und        //08
        } = req.body    
        strSQL = "UPDATE mst_producto SET"
        strSQL += "  nombre = $4";
        strSQL += " ,descripcion = $5";
        strSQL += " ,precio_venta = $6";
        strSQL += " ,porc_igv = $7";                
        strSQL += " ,cont_und= $8";
        
        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " AND id_producto = $3";

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,id_producto,
                                                nombre,
                                                descripcion,
                                                precio_venta,
                                                porc_igv,
                                                cont_und]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Producto no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

const importarExcelProductos = async (req, res, next) => {
    //cuidado con los json que llegan con archivos adjuntos,se parsea primero    
    const datosCarga = JSON.parse(req.body.datosCarga);
    const {
        id_anfitrion,
        documento_id
    } = datosCarga;
    
    try {
      const fileBuffer = req.file.buffer;

      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
      });
  
        const csvData = sheetData
        .map((row,index) => [
            id_anfitrion,                                 // id_anfitrion
            documento_id,                                 // documento_id            
            'EXCEL',                                        //origen
            (row[0] || '').toString().replace(/,/g, ''),    //A id_producto
            (row[1] || '').toString().replace(/,/g, ''),    //B nombre
            (row[2] || '').toString().replace(/,/g, ''),    //C descripcion
            (row[3] || '').toString().replace(/,/g, ''),    //D precio_unitario
            (row[4] || '').toString().replace(/,/g, ''),    //E porc_igv
            (row[5] || '').toString().replace(/,/g, '')     //F cont_und
        ].join(','))
        .join('\n');
        
        //console.log(csvData);

      await pool.query('BEGIN');
  
      /////////////////////////////////////////////////////////////
      //console.log(csvData);
      // Convertimos la cadena CSV a un flujo de lectura
      const csvReadableStream = Readable.from([csvData]);

      // Insertamos los datos desde el CSV a la tabla mct_datos
      const client = await pool.connect();
      try {
        //const ingestStream = client.query(copyFrom(`COPY mst_producto FROM STDIN WITH CSV HEADER DELIMITER ','`))
        const ingestStream = client.query(copyFrom(`
            COPY mst_producto (id_usuario, documento_id, origen, id_producto, nombre, descripcion, precio_venta, porc_igv, cont_und)
            FROM STDIN WITH CSV DELIMITER ',' HEADER;
        `));
        await pipeline(csvReadableStream, ingestStream)
      } finally {
        client.release();
      }

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
const eliminarProductoMasivo = async (req,res,next)=> {
    try {
        const {id_anfitrion, documento_id,origen} = req.params;
        let strSQL;
        
        //primero eliminar todos detalles
        strSQL = "DELETE FROM mst_producto ";
        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " AND origen = $3";

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,origen]);
        console.log(strSQL,[id_anfitrion,documento_id,origen]);
        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Productos no encontrados"
            });


        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};

const importarExcelProductosPrecios = async (req, res, next) => {
    //cuidado con los json que llegan con archivos adjuntos,se parsea primero    
    const datosCarga = JSON.parse(req.body.datosCarga);
    const {
        id_anfitrion,
        documento_id
    } = datosCarga;
    
    try {
      const fileBuffer = req.file.buffer;

      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
      });
  
        const csvData = sheetData
        .map((row,index) => [
            id_anfitrion,                                 // id_anfitrion
            documento_id,                                 // documento_id            
            'EXCEL',                                        //origen
            (row[0] || '').toString().replace(/,/g, ''),    //A id_producto
            (row[1] || '').toString().replace(/,/g, ''),    //B unidades
            (row[2] || '').toString().replace(/,/g, ''),    //C precio_venta
            (row[3] || '').toString().replace(/,/g, ''),    //D cant_min
            (row[4] || '').toString().replace(/,/g, ''),    //E cant_max
        ].join(','))
        .join('\n');
        
        //console.log(csvData);

      await pool.query('BEGIN');
  
      /////////////////////////////////////////////////////////////
      //console.log(csvData);
      // Convertimos la cadena CSV a un flujo de lectura
      const csvReadableStream = Readable.from([csvData]);

      // Insertamos los datos desde el CSV a la tabla mct_datos
      const client = await pool.connect();
      try {
        //const ingestStream = client.query(copyFrom(`COPY mst_producto FROM STDIN WITH CSV HEADER DELIMITER ','`))
        const ingestStream = client.query(copyFrom(`
            COPY mst_producto_precio (id_usuario, documento_id, origen, id_producto, unidades, precio_venta, cant_min, cant_max)
            FROM STDIN WITH CSV DELIMITER ',' HEADER;
        `));
        await pipeline(csvReadableStream, ingestStream)
      } finally {
        client.release();
      }

      await pool.query('COMMIT');
      /////////////////////////////////////////////////////////////
      //console.log("final");
      res.status(200).json({ mensaje: 'Hoja Excel con Precios insertado correctamente en base datos' });
    } catch (error) {
      console.log(error);
      await pool.query('ROLLBACK');
      next(error);
    }
};

const obtenerProductoPrecio = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id,id_producto,unidades} = req.params;

        strSQL = "select mst_producto_precio.*, mst_producto.nombre from mst_producto_precio "
        strSQL += " on (mst_producto_precio.id_usuario = mst_producto.id_usuario and ";
        strSQL += "     mst_producto_precio.documento_id = mst_producto.documento_id and ";
        strSQL += "     mst_producto_precio.id_producto = mst_producto.id_producto )";
        strSQL += " where mst_producto_precio.id_usuario = $1";
        strSQL += " and mst_producto_precio.documento_id = $2";
        strSQL += " and mst_producto_precio.id_producto = $3";
        strSQL += " and mst_producto_precio.unidades = $4";

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,id_producto,unidades]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Precio del Producto no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const actualizarProductoPrecio = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id,id_producto,unidades} = req.params; //04
        const { 
                precio_venta,   //05
                cant_min,       //06
                cant_max        //07
        } = req.body    

        strSQL = `UPDATE mst_producto_precio SET"
                    precio_venta = $5
                    ,cant_min = $6
                    ,cant_max = $7
                    WHERE id_usuario = $1
                    AND documento_id = $2
                    AND id_producto = $3
                    AND unidades = $4`;

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,id_producto,unidades,
                                                precio_venta,
                                                cant_min,
                                                cant_max]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Precio de Producto no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

module.exports = {
    obtenerTodosProductos,
    obtenerTodosProductosPrecios,
    obtenerTodosProductosPopUp,
    obtenerPreciosProducto,
    obtenerProducto,
    obtenerProductoIgv,
    obtenerParametrosVenta,
    crearProducto,
    eliminarProducto,
    eliminarProductoMasivo,
    actualizarProducto,
    importarExcelProductos,
    importarExcelProductosPrecios,
    obtenerProductoPrecio,
    actualizarProductoPrecio
 }; 