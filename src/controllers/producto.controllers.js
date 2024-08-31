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
        const {id_usuario,documento_id} = req.params;
        strSQL = "SELECT "
        strSQL += " id_producto";   //03
        strSQL += ",nombre";        //04
        strSQL += ",descripcion";   //05
        strSQL += ",precio_venta";  //06
        strSQL += ",cont_und";      //07
        strSQL += ",porc_igv";      //08
        strSQL += ",origen";        //09
        strSQL += " FROM mst_producto";   //03

        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " ORDER BY nombre";
        //console.log(strSQL,[id_usuario,documento_id]);
        const todosRegistros = await pool.query(strSQL,[id_usuario,documento_id]);
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }

    //res.send('Listado de todas los zonas');
};
const obtenerProducto = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_usuario,documento_id,id_producto} = req.params;

        strSQL = "select * from mst_producto "
        strSQL += " where id_usuario = $1";
        strSQL += " and documento_id = $2";
        strSQL += " and id_producto = $3";

        const result = await pool.query(strSQL,[id_usuario,documento_id,id_producto]);

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
        const {id_usuario,documento_id,id_producto} = req.params;
        strSQL = "select porc_igv from mst_producto "
        strSQL += " where id_usuario = $1";
        strSQL += " and documento_id = $2";
        strSQL += " and id_producto = $3";

        const result = await pool.query(strSQL,[id_usuario,documento_id,id_producto]);

        if (result.rows.length === 0){
            res.json({porc_igv:"0.00"});
        };

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearProducto = async (req,res,next)=> {
    const { 
            id_usuario,     //01
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
            id_usuario,     //01
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
        next(error)
    }
};

const eliminarProducto = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_usuario,documento_id,id_producto} = req.params;
        strSQL = "DELETE FROM mst_producto "
        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " AND id_producto = $3";

        const result = await pool.query(strSQL,[id_usuario,documento_id,id_producto]);

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
        const {id_usuario,documento_id,id_producto} = req.params; //03
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

        const result = await pool.query(strSQL,[id_usuario,documento_id,id_producto,
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
        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Productos no encontrados"
            });


        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};

module.exports = {
    obtenerTodosProductos,
    obtenerProducto,
    obtenerProductoIgv,
    crearProducto,
    eliminarProducto,
    eliminarProductoMasivo,
    actualizarProducto,
    importarExcelProductos    
 }; 