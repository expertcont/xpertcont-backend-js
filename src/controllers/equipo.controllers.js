const pool = require('../db');
const xlsx = require('xlsx');
const { Readable } = require('stream');
//const {devuelveCadenaNull,devuelveNumero, convertirFechaString, convertirFechaStringComplete, corregirTCPEN, corregirMontoNotaCredito} = require('../utils/libreria.utils');
const { from: copyFrom } = require('pg-copy-streams');
const { pipeline } = require('node:stream/promises');

const obtenerTodosEquipos = async (req,res,next)=> {
    try {
        //console.log(req.params);
        let strSQL;
        const {id_anfitrion,documento_id} = req.params;
        strSQL = "SELECT "
        strSQL += " id_equipo";   //03
        strSQL += ",nombre";      //04
        strSQL += ",descripcion"; //05
        strSQL += ",placa";     //06
        strSQL += ",marca";     //07
        strSQL += ",modelo";    //08
        strSQL += ",serie";     //09
        strSQL += ",precio_dia";     //10
        strSQL += ",precio_mes";     //11
        strSQL += ",estado";     //12
        strSQL += " FROM mst_equipo"; 

        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " ORDER BY nombre";
        //console.log(strSQL,[id_usuario,documento_id]);
        const todosRegistros = await pool.query(strSQL,[id_anfitrion,documento_id]);
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }
    //res.send('Listado de todas los zonas');
};
const obtenerTodosEquiposPopUp = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id} = req.params;
        strSQL = "SELECT "
        strSQL += " id_equipo as codigo";   
        strSQL += ",nombre as descripcion";
        strSQL += ",(precio_venta || '-' || cont_und || '-' || porc_igv )::varchar as auxiliar";
        strSQL += " FROM mst_equipo";

        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " ORDER BY nombre";
        const todosRegistros = await pool.query(strSQL,[id_anfitrion,documento_id]);
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerEquipo = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id,id_equipo} = req.params;

        strSQL = "select * from mst_equipo "
        strSQL += " where id_usuario = $1";
        strSQL += " and documento_id = $2";
        strSQL += " and id_equipo = $3";

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,id_equipo]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Equipo no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};
const obtenerEquipoIgv = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id,id_equipo} = req.params;
        strSQL = "select porc_igv from mst_equipo "
        strSQL += " where id_usuario = $1";
        strSQL += " and documento_id = $2";
        strSQL += " and id_equipo = $3";

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,id_equipo]);

        if (result.rows.length === 0){
            res.json({porc_igv:"0.00"});
        };

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearEquipo = async (req,res,next)=> {
    const { 
            id_anfitrion,   //01
            documento_id,   //02
            id_equipo,      //03    
            nombre,         //04
            descripcion,    //05
            placa,          //06
            marca,          //07
            modelo,         //08
            serie,          //09
            precio_dia,     //10
            precio_mes,     //11
        } = req.body
    let strSQL;
    try {
        strSQL = "INSERT INTO mst_equipo(";
        strSQL += " id_usuario";    //01
        strSQL += ",documento_id";  //02
        strSQL += ",id_equipo";     //03
        strSQL += ",nombre";        //04
        strSQL += ",descripcion";   //05
        strSQL += ",placa";         //06
        strSQL += ",marca";         //07
        strSQL += ",modelo";        //08
        strSQL += ",serie";         //09
        strSQL += ",precio_dia";    //10
        strSQL += ",precio_mes";    //11
        strSQL += ",estado";        //12
        strSQL += ") VALUES ( ";

        strSQL += " $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'BODEGA'";
        strSQL += " ) RETURNING *";
        const parametros =         [   
            id_anfitrion,   //01
            documento_id,   //02
            id_equipo,      //03
            nombre,         //04
            descripcion,    //05
            placa,          //06
            marca,          //07
            modelo,         //08
            serie,          //09
            precio_dia,     //10
            precio_mes,     //11
        ];

        console.log(strSQL,parametros);
        const result = await pool.query(strSQL,parametros);
        
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const eliminarEquipo = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id,id_equipo} = req.params;
        strSQL = "DELETE FROM mst_equipo "
        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " AND id_equipo = $3";

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,id_equipo]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Equipo no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};
const actualizarEquipo = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_anfitrion,documento_id,id_equipo} = req.params; //03
        const { nombre,         //04
                descripcion,    //05
                placa,          //06
                marca,          //07
                modelo,         //08
                serie,          //09
                precio_dia,     //10
                precio_mes,     //11
        } = req.body    
        strSQL = "UPDATE mst_equipo SET"
        strSQL += "  nombre = $4";
        strSQL += " ,descripcion = $5";
        strSQL += " ,placa = $6";
        strSQL += " ,marca = $7";                
        strSQL += " ,modelo= $8";
        strSQL += " ,serie= $9";
        strSQL += " ,precio_dia= $10";
        strSQL += " ,precio_mes= $11";
        
        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " AND id_equipo = $3";

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,id_equipo,
                                                nombre,
                                                descripcion,
                                                placa,
                                                marca,
                                                modelo,
                                                serie,
                                                precio_dia,
                                                precio_mes,
                                            ]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Equipo no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

const importarExcelEquipos = async (req, res, next) => {
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
            (row[0] || '').toString().replace(/,/g, ''),    //A id_equipo
            (row[1] || '').toString().replace(/,/g, ''),    //B nombre
            (row[2] || '').toString().replace(/,/g, ''),    //C descripcion
            (row[3] || '').toString().replace(/,/g, ''),    //D placa
            (row[4] || '').toString().replace(/,/g, ''),    //E marca
            (row[5] || '').toString().replace(/,/g, ''),     //F modelo
            (row[6] || '').toString().replace(/,/g, ''),     //G serie
            (row[7] || '').toString().replace(/,/g, ''),     //H precio_dia
            (row[8] || '').toString().replace(/,/g, ''),     //I precio_mes
            'BODEGA',    //estado 'BODEGA'(defaUlt),'ARRENDADO','MANTENCION'
            'EXCEL'      //origen
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
        //const ingestStream = client.query(copyFrom(`COPY mst_equipo FROM STDIN WITH CSV HEADER DELIMITER ','`))
        const ingestStream = client.query(copyFrom(`
            COPY mst_equipo (id_usuario, documento_id, id_equipo, nombre, descripcion, placa, marca, modelo, serie, precio_dia, precio_mes, estado, origen)
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
const eliminarEquipoMasivo = async (req,res,next)=> {
    try {
        const {id_anfitrion, documento_id,origen} = req.params;
        let strSQL;
        
        //primero eliminar todos detalles
        strSQL = "DELETE FROM mst_equipo ";
        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " AND origen = $3";

        const result = await pool.query(strSQL,[id_anfitrion,documento_id,origen]);
        console.log(strSQL,[id_anfitrion,documento_id,origen]);
        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Equipos no encontrados"
            });


        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};

module.exports = {
    obtenerTodosEquipos,
    obtenerTodosEquiposPopUp,
    obtenerEquipo,
    obtenerEquipoIgv,
    crearEquipo,
    eliminarEquipo,
    eliminarEquipoMasivo,
    actualizarEquipo,
    importarExcelEquipos    
 }; 