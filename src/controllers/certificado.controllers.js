const pool = require('../db');
const xlsx = require('xlsx');
const { Readable } = require('stream');
const {devuelveCadenaNull,devuelveNumero, convertirFechaString, convertirFechaStringComplete, corregirTCPEN, corregirMontoNotaCredito} = require('../utils/libreria.utils');
const { from: copyFrom } = require('pg-copy-streams');
const { pipeline } = require('node:stream/promises');
const AdmZip = require('adm-zip');

const fileType = require('file-type');


const obtenerAsiento = async (req,res,next)=> {
    try {
        const {id_anfitrion,documento_id,periodo,id_libro,num_asiento} = req.params;
        let strSQL ;
        
        strSQL = "SELECT mct_asientocontable.* ";
        strSQL = strSQL + " ,cast(mct_asientocontable.r_fecemi as varchar)::varchar(50) as fecemi";
        strSQL = strSQL + " ,cast(mct_asientocontable.r_fecvcto as varchar)::varchar(50) as fecvcto";
        strSQL = strSQL + " ,cast(mct_asientocontable.r_fecemi_ref as varchar)::varchar(50) as fecemi_ref";
        strSQL = strSQL + " ,cast(mct_asientocontable.fecha_asiento as varchar)::varchar(50) as fecha_asiento";
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


const importarExcelRegVentas = async (req, res, next) => {
    let strSQL;
    //cuidado con los json que llegan con archivos adjuntos,se parsea primero    
    const datosCarga = JSON.parse(req.body.datosCarga);
    const {
        id_anfitrion,
        documento_id,
        id_invitado,
    } = datosCarga;
    
    try {
      const fileBuffer = req.file.buffer;
      //Extraer la extensión del nombre del archivo
      const fileName = req.file.originalname;
      const lastDotIndex = fileName.lastIndexOf('.');
      const fileExtension = lastDotIndex !== -1 ? fileName.slice(lastDotIndex) : '';
      let pos=0;
      console.log('extension: ', fileExtension);
      if (fileExtension==='.xlsx') { pos=0; } //Excel datos propios
      if (fileExtension==='.xls') { pos=4; } //Excel simple csv sire
      //Fin extension, determina inicio de columna

      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
      });
  
      //Seleccion general todas las columnas y eliminamos comas antes de convertirlo  a CSV
      //const csvData = sheetData.map(row => row.map(cell => (cell === '' ? null : cell)).join(',')).join('\n');
      // Seleccion columna x columna de interés (código y nombre con numero columna)
      /*const csvData = sheetData
        .map((row) => [row[0], row[1]].join(','))
        .join('\n');*/

        const csvData = sheetData
        .map((row,index) => [
            index > 0 ? convertirFechaStringComplete(row[pos+0]) : row[pos+0], //A emision
            index > 0 ? convertirFechaStringComplete(row[pos+1]) : row[pos+1], //B vcto
            (row[pos+2] || '').toString().replace(/,/g, ''),    //C cod
            (row[pos+3] || '').toString().replace(/,/g, ''),    //D serie
            (row[pos+4] || '').toString().replace(/,/g, ''),    //E numero
            (row[pos+5] || '').toString().replace(/,/g, ''),    //F numero2
            (row[pos+6] || '').toString().replace(/,/g, ''),    //G tipo
            (row[pos+7] || '').toString().replace(/,/g, ''),    //H documento_id
            (row[pos+8] || '').toString().replace(/,/g, ''),    //I razon social
            
            (corregirMontoNotaCredito(row[pos+9],row[pos+2]) || ''),    //J export
            (corregirMontoNotaCredito(row[pos+10],row[pos+2]) || ''),    //K base
            (corregirMontoNotaCredito(row[pos+11],row[pos+2]) || ''),    //L DESC BASE (NEW)***
            (corregirMontoNotaCredito(row[pos+12],row[pos+2]) || ''),    //M igv
            (corregirMontoNotaCredito(row[pos+13],row[pos+2]) || ''),    //N DESC IGV (NEW)***
            (corregirMontoNotaCredito(row[pos+14],row[pos+2]) || ''),    //O exo
            (corregirMontoNotaCredito(row[pos+15],row[pos+2]) || ''),    //P inafect
            (corregirMontoNotaCredito(row[pos+16],row[pos+2]) || ''),    //Q ISC (NEW)***
            (corregirMontoNotaCredito(row[pos+17],row[pos+2]) || ''),    //R BASE PILADO (NEW)***
            (corregirMontoNotaCredito(row[pos+18],row[pos+2]) || ''),    //S IGV PILADO (NEW)***

            (corregirMontoNotaCredito(row[pos+19],row[pos+2]) || ''),    //T icbp
            (corregirMontoNotaCredito(row[pos+20],row[pos+2]) || ''),    //U otros
            (corregirMontoNotaCredito(row[pos+21],row[pos+2]) || ''),    //V total
            (corregirMontoNotaCredito(row[pos+22],row[pos+2]) || ''),    //W moneda

            (corregirTCPEN(row[pos+23],row[pos+22]) || ''),    //X tc
            index > 0 ? convertirFechaStringComplete(row[pos+24]) : row[pos+24], //Y emision ref
            (row[pos+25] || ''),    //Z cod ref
            (row[pos+26] || ''),    //AA serie ref
            (row[pos+27] || '')    //AB num ref
        ].join(','))
        .join('\n');
        
        //console.log(csvData);

      await pool.query('BEGIN');
  
      // Creamos la tabla temporal solo con las columnas necesarias
      const createTableQuery = `
        DROP TABLE IF EXISTS mct_datos;
        CREATE TEMP TABLE mct_datos (
            r_fecemi DATE,
            r_fecvcto DATE,
            r_cod VARCHAR(2),
            r_serie VARCHAR(5),
            r_numero VARCHAR(22),
            r_numero2 VARCHAR(22),
            r_id_doc VARCHAR(2),
            r_documento_id VARCHAR(20),
            r_razon_social VARCHAR(200),
            r_base001 NUMERIC(14,2),
            r_base002 NUMERIC(14,2),
            r_base_desc NUMERIC(14,2),

            r_igv002 NUMERIC(14,2),
            r_igv_desc NUMERIC(14,2),

            r_base003 NUMERIC(14,2),
            r_base004 NUMERIC(14,2),
            
            r_monto_isc NUMERIC(14,2),            
            r_base_ivap NUMERIC(14,2),
            r_igv_ivap NUMERIC(14,2),

            r_monto_icbp NUMERIC(12,2),
            r_monto_otros NUMERIC(14,2),
            r_monto_total NUMERIC(14,2),
            r_moneda VARCHAR(5),
            r_tc NUMERIC(5,3),
            r_fecemi_ref DATE,
            r_cod_ref VARCHAR(2),
            r_serie_ref VARCHAR(5),
            r_numero_ref VARCHAR(22)
        );
      `;  
            
      await pool.query(createTableQuery);

      /////////////////////////////////////////////////////////////
      //console.log(csvData);
      // Convertimos la cadena CSV a un flujo de lectura
      const csvReadableStream = Readable.from([csvData]);

      // Insertamos los datos desde el CSV a la tabla mct_datos
      //Origen Documentacion https://www.npmjs.com/package/pg-copy-streams
      const client = await pool.connect();
      try {
        const ingestStream = client.query(copyFrom(`COPY mct_datos FROM STDIN WITH CSV HEADER DELIMITER ','`))
        //const sourceStream = fs.createReadStream(csvData)
        //console.log(sourceStream);
        await pipeline(csvReadableStream, ingestStream)
      } finally {
        client.release();
      }
      //await pool.end()

        //////////////////////////////////////////////////////////////
        // Realiza la operación de inserción desde la tabla temporal a mct_venta
        strSQL = "INSERT INTO mct_asientocontable";
        strSQL +=  " (";
        strSQL += "  id_usuario";   //01
        strSQL += " ,documento_id"; //02
        strSQL += " ,periodo";      //03
        strSQL += " ,id_libro";     //04
        strSQL += " ,num_asiento";  //05 generado *
    
        strSQL += " ,glosa";        //06
        strSQL += " ,debe";         //07
        strSQL += " ,haber";        //08
        strSQL += " ,debe_me";      //09
        strSQL += " ,haber_me";     //10
        strSQL += " ,mayorizado";   //11
        strSQL += " ,ctrl_crea";     //12 generado *
        strSQL += " ,ctrl_crea_us";     //13
        strSQL += " ,r_id_doc";         //14
        strSQL += " ,r_documento_id";   //15
        strSQL += " ,r_razon_social";   //16
    
        strSQL += " ,r_cod";        //17
        strSQL += " ,r_serie";      //18
        strSQL += " ,r_numero";     //19
        strSQL += " ,r_numero2";    //20
        strSQL += " ,r_fecemi";     //21
        strSQL += " ,r_fecvcto";    //22
        strSQL += " ,r_cod_ref";    //23
        strSQL += " ,r_serie_ref";  //24
        strSQL += " ,r_numero_ref"; //25
        strSQL += " ,r_fecemi_ref"; //26
        strSQL += " ,r_base001";    //27
        strSQL += " ,r_base002";    //28
        strSQL += " ,r_base003";    //29
        strSQL += " ,r_base004";    //30
        strSQL += " ,r_base_desc";    //28 new        
        strSQL += " ,r_igv002";     //31
        strSQL += " ,r_igv_desc";     //31 new
        
        strSQL += " ,r_monto_isc";     //32 new
        strSQL += " ,r_base_ivap";     //32 new
        strSQL += " ,r_igv_ivap";     //32 new

        strSQL += " ,r_monto_icbp";     //32
        strSQL += " ,r_monto_otros";    //33
        strSQL += " ,r_monto_total";    //34
        strSQL += " ,r_moneda";         //35
        strSQL += " ,r_tc";             //36
        strSQL += " ,origen";             //36
        strSQL += " )";
        strSQL += " SELECT ";
        strSQL += "  $1";             //id_anfitrion
        strSQL += " ,$2";             //documento_id
        strSQL += " ,$3";             //periodo
        strSQL += " ,$4";             //id_libro
        strSQL += " ,fct_genera_asiento($1,$2,$3,$4)"; //num_asiento
        strSQL += " ,'VENTA'";             //glosa
        strSQL += " ,0";             //D
        strSQL += " ,0";             //H
        strSQL += " ,0";             //D $
        strSQL += " ,0";             //H $
        strSQL += " ,'0'";             //MAYORIZADO
        strSQL += " ,CURRENT_TIMESTAMP";       //ctrl_crea
        strSQL += " ,$5";             //id_invitado
        strSQL += " ,r_id_doc";         //excel
        strSQL += " ,r_documento_id";   //excel
        strSQL += " ,r_razon_social";   //excel
    
        strSQL += " ,r_cod";        //excel
        strSQL += " ,r_serie";      //excel
        strSQL += " ,r_numero";     //excel
        strSQL += " ,r_numero2";    //excel
        strSQL += " ,r_fecemi";     //excel
        strSQL += " ,r_fecvcto";    //excel
        strSQL += " ,r_cod_ref";    //excel
        strSQL += " ,r_serie_ref";  //excel
        strSQL += " ,r_numero_ref"; //excel
        strSQL += " ,r_fecemi_ref"; //excel
        strSQL += " ,r_base001";    //excel
        strSQL += " ,r_base002";    //excel
        strSQL += " ,r_base003";    //excel
        strSQL += " ,r_base004";    //excel
        strSQL += " ,r_base_desc";    //28 new        
        strSQL += " ,r_igv002";     //excel
        strSQL += " ,r_igv_desc";     //31 new  

        strSQL += " ,r_monto_isc";     //32 new
        strSQL += " ,r_base_ivap";     //32 new
        strSQL += " ,r_igv_ivap";     //32 new
        
        strSQL += " ,r_monto_icbp";     //excel
        strSQL += " ,r_monto_otros";    //excel
        strSQL += " ,r_monto_total";    //excel
        strSQL += " ,r_moneda";         //excel
        strSQL += " ,r_tc";             //excel
        if (fileExtension==='.xls') { 
            strSQL += " ,'SIRE'";          //origen
        } //Sire CSV Excel
        if (fileExtension==='.xlsx') {
            strSQL += " ,'EXCEL'";          //origen
        } //Excel datos propios
        strSQL += " FROM mct_datos";    
        const parametros = [   
            id_anfitrion,    //01
            documento_id,    //02
            periodo,         //03
            id_libro,        //04
            id_invitado,     //05        
        ];
            
        //console.log(strSQL);
        //console.log('parametros arreglo:',parametros);
        await pool.query(strSQL, parametros);

      await client.query(`DROP TABLE mct_datos`);
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
  

const eliminarAsiento = async (req,res,next)=> {
    try {
        const {id_anfitrion, documento_id, periodo, id_libro, num_asiento} = req.params;
        var strSQL;
        var result;
        var result2;
        
        //primero eliminar todos detalles
        strSQL = "DELETE FROM mct_asientocontabledet ";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND documento_id = $2";
        strSQL = strSQL + " AND periodo = $3";
        strSQL = strSQL + " AND id_libro = $4";
        strSQL = strSQL + " AND num_asiento = $5";
        //console.log(strSQL);
        //console.log([id_anfitrion,documento_id,periodo,id_libro,num_asiento]);

        result = await pool.query(strSQL,[id_anfitrion,documento_id,periodo,id_libro,num_asiento]);
        /*if (result.rowCount === 0)
            return res.status(404).json({
                message:"Detalle no encontrado"
            });*/

        //luego eliminar cabecera
        strSQL = "DELETE FROM mct_asientocontable ";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND documento_id = $2";
        strSQL = strSQL + " AND periodo = $3";
        strSQL = strSQL + " AND id_libro = $4";
        strSQL = strSQL + " AND num_asiento = $5";
        //console.log(strSQL);
        //console.log([id_anfitrion,documento_id,periodo,id_libro,num_asiento]);
        result2 = await pool.query(strSQL,[id_anfitrion,documento_id,periodo,id_libro,num_asiento]);
        if (result2.rowCount === 0)
            return res.status(404).json({
                message:"ASiento no encontrado"
            });

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
            r_monto_total,      //30
            r_moneda,           //31            
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
            retencion4ta,         //40 new opcional

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

        //console.log(strSQL);
        //console.log(parametros);

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


module.exports = {
    obtenerAsiento,
    importarExcelRegVentas,
    eliminarAsiento,
    actualizarAsiento
 }; 