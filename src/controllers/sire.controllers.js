const pool = require('../db');
const xlsx = require('xlsx');
const { Readable } = require('stream');
const {devuelveCadenaNull,devuelveNumero, convertirFechaString, convertirFechaStringComplete, corregirTCPEN, corregirMontoNotaCredito} = require('../utils/libreria.utils');
const { from: copyFrom } = require('pg-copy-streams');
const { pipeline } = require('node:stream/promises');
const fetch = require('node-fetch');
const { serialize } = require('node:v8');

const generarTicketSireCredenciales = async (id_anfitrion,documento_id) => {
  const strSQL = `
      SELECT sire_id,sire_secret,sire_sol,sire_solpwd FROM mad_usuariocontabilidad
      WHERE id_usuario = $1
      AND documento_id = $2
  `;
  const { rows } = await pool.query(strSQL, [id_anfitrion,documento_id]);
  return rows;
};
const generarTicketSireInsertDB = async (id_usuario,documento_id,periodo,id_libro,sire_ticket) => {
  try {
      //console.log(documento_id, razon_social, id_doc);
      const insertQuery = `
          INSERT INTO mct_contabilidadticket (id_usuario,documento_id,periodo,id_libro,sire_tpropuesta)
          VALUES ($1, $2, $3, $4, $5) RETURNING *
      `;
      const values = [id_usuario,documento_id,periodo,id_libro,sire_ticket];
      const insertResult = await pool.query(insertQuery, values);
      //console.log('Dato insertado:', insertResult.rows[0]);
  } catch (dbError) {
      if (dbError.code === '23505') { // Código de error para duplicados en PostgreSQL
          console.log('El dato ya existe en la base de datos, finalizamos simplemente');
      } else {
          throw dbError;
      }
  }
};
const generarTicketSireConsultaDB = async (id_anfitrion,documento_id,periodo,id_libro) => {
  const strSQL = `
      SELECT sire_tpropuesta FROM mct_contabilidadticket
      WHERE id_usuario = $1
      AND documento_id = $2
      AND periodo = $3      
      AND id_libro = $4
  `;
  const { rows } = await pool.query(strSQL, [id_anfitrion,documento_id,periodo,id_libro]);
  return rows;
};


const generarTicketSireSunat = async (id_anfitrion,documento_id,periodo,id_libro) => {
  //Cambio y Mapeo id_libro por valores sunat3b4
  const libroMap = {
    "014": "140000",
    "008": "080000",
  };
  const parseIdLibro = (id) => libroMap[id] || id;
  const id_libro_parseado = parseIdLibro(id_libro);
  
  try {
      /////////////////////////////////////////////////////////////
      //1: Api sunat 5.1 (Obtener token)
      const rows = await generarTicketSireCredenciales(id_anfitrion,documento_id);
      const sUrlSunatToken = `
      https://api-seguridad.sunat.gob.pe/v1/clientessol/${rows[0].sire_id}/oauth2/token/
      `;
      //Datos a enviar en el cuerpo de la solicitud
      const data = new URLSearchParams({
        'grant_type': 'password',
        'scope': 'https://api-sire.sunat.gob.pe',
        'client_id': rows[0].sire_id,
        'client_secret': rows[0].sire_secret,
        'username': documento_id + rows[0].sire_sol,
        'password': rows[0].sire_solpwd
      });        
      const response = await fetch(sUrlSunatToken, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: data
      });
      // Analizar la respuesta como JSON
      const jsonResponse = await response.json();

      /////////////////////////////////////////////////////////////
      const options = {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jsonResponse.access_token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      };

      /////////////////////////////////////////////////////////////
      //3: API sunat 5.18 descargar propuesta (Solo numero Ticket)
      //Cuidado con el Periodo
      const periodoFormateado = periodo.replace(/-/g, '');
      const sAliasLibro = id_libro_parseado === '140000' ? 'rvie' : 'rce';
      const sUrlSunatTicket = `
      https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/${sAliasLibro}/propuesta/web/propuesta/${periodoFormateado}/exportapropuesta?codTipoArchivo=0
      `;
      const responseTicket = await fetch(sUrlSunatTicket, options);
      const jsonResponseTicket = await responseTicket.json();
      //console.log(jsonResponseTicket);

      const ticketSunat = jsonResponseTicket.numTicket;
      
      //Ahora insertar en tabla 
      await generarTicketSireInsertDB(id_anfitrion,documento_id,periodo,id_libro_parseado,ticketSunat);
      return ticketSunat;
      //res.json(jsonResponseTicket);
  } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message }); // Aquí se detiene la ejecución si ocurre un error
  }
};

const generarTicketSireAdmin = async (req, res, next) => {
  const {id_anfitrion,documento_id,periodo,id_libro} = req.body;
  
  try {
      /////////////////////////////////////////////////////////////
      //1: Consultar si existe ticket Generado en BD
      const rowTicket = await generarTicketSireConsultaDB(id_anfitrion,documento_id,periodo,id_libro);

      //2: Si no existe Ticket BD, generar Ticket Nuevo
      if (rowTicket.length > 0) {
          // Acceder al primer resultado y al campo sire_ticket
          //return rows[0].sire_ticket; // Si solo te interesa el primer valor
          return res.status(200).json({ ticket: rowTicket[0].sire_tpropuesta }); // Aquí se detiene la ejecución si ocurre un error
      } else {
          //Genera ticket desde sunat
          const ticketSunat = generarTicketSireSunat(id_anfitrion,documento_id,periodo,id_libro);
          return res.status(200).json({ ticket: ticketSunat }); // Aquí se detiene la ejecución si ocurre un error
      }
      //El resto del proceso, se ejecuta en otro EndPoint
     
  } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message }); // Aquí se detiene la ejecución si ocurre un error
  }
};

const generarTicketSireDescarga = async (req, res, next) => {
  const {id_anfitrion,documento_id,id_libro,periodo,ticket,nombre_archivo_rep} = req.body;
  //Cambio y Mapeo id_libro por valores sunat3b4
  const libroMap = {
    "014": "140000",
    "008": "080000",
  };
  const parseIdLibro = (id) => libroMap[id] || id;
  const id_libro_parseado = parseIdLibro(id_libro);
  
  try {
      /////////////////////////////////////////////////////////////
      //1: Api sunat 5.1 (Obtener token)
      const rows = await generarTicketSireCredenciales(id_anfitrion,documento_id);
      const sUrlSunatToken = `
      https://api-seguridad.sunat.gob.pe/v1/clientessol/${rows[0].sire_id}/oauth2/token/
      `;
      //Datos a enviar en el cuerpo de la solicitud
      const data = new URLSearchParams({
        'grant_type': 'password',
        'scope': 'https://api-sire.sunat.gob.pe',
        'client_id': rows[0].sire_id,
        'client_secret': rows[0].sire_secret,
        'username': documento_id + rows[0].sire_sol,
        'password': rows[0].sire_solpwd
      });        
      const response = await fetch(sUrlSunatToken, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: data
      });
      const jsonResponse = await response.json();
      
      const options = {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jsonResponse.access_token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      };
    
      const periodoFormateado = periodo.replace(/-/g, '');
      /////////////////////////////////////////////////////////////
      //5: API sunat 5.17 Descargar Archivo (con datos anteriores, ticket y nombre de archivo)
      const sUrlSunatTicketDescarga = `
      https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/archivoreporte?nomArchivoReporte=${nombre_archivo_rep}&codTipoArchivoReporte=01&codLibro=${id_libro_parseado}&perTributario=${periodoFormateado}&codProceso=10&numTicket=${ticket}
      `;
      const responseTicketDescarga = await fetch(sUrlSunatTicketDescarga, options);
      //const jsonResponseTicketDescarga = await responseTicketDescarga.json();
      //res.json(jsonResponseTicketDescarga);
      
      // Obtén el archivo como buffer
      const zipBuffer = await responseTicketDescarga.buffer();

      // Configura los encabezados para la descarga del archivo
      res.setHeader('Content-Disposition', `attachment; filename=${nombre_archivo_rep}`);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', zipBuffer.length);

      // Envía el archivo como respuesta
      res.send(zipBuffer);

  } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message }); // Aquí se detiene la ejecución si ocurre un error
  }
};

const generarTicketSireEstado = async (req, res, next) => {
    const {id_anfitrion,documento_id,periodo,ticket} = req.body;
    
    try {
        /////////////////////////////////////////////////////////////
        //1: Api sunat 5.1 (Obtener token)
        const rows = await generarTicketSireCredenciales(id_anfitrion,documento_id);
        const sUrlSunatToken = `
        https://api-seguridad.sunat.gob.pe/v1/clientessol/${rows[0].sire_id}/oauth2/token/
        `;
        //Datos a enviar en el cuerpo de la solicitud
        const data = new URLSearchParams({
          'grant_type': 'password',
          'scope': 'https://api-sire.sunat.gob.pe',
          'client_id': rows[0].sire_id,
          'client_secret': rows[0].sire_secret,
          'username': documento_id + rows[0].sire_sol,
          'password': rows[0].sire_solpwd
        });        
        const response = await fetch(sUrlSunatToken, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: data
        });

        // Analizar la respuesta como JSON
        const jsonResponse = await response.json();
        /////////////////////////////////////////////////////////////
        const options = {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${jsonResponse.access_token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        };
        const periodoFormateado = periodo.replace(/-/g, '');
        
        /////////////////////////////////////////////////////////////
        //4: API sunat 5.16 Consultar Ticket (Parametros de tamaño datos y demas generales)
        const sUrlSunatTicketConsulta = `
        https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/consultaestadotickets?perIni=${periodoFormateado}&perFin=${periodoFormateado}&page=1&perPage=100&numTicket=${ticket}
        `;
        const responseTicketConsulta = await fetch(sUrlSunatTicketConsulta, options);
        const jsonResponseTicketConsulta = await responseTicketConsulta.json();
        //console.log('Estado Ticket Consulta:', jsonResponseTicketConsulta);
        
        const registros = jsonResponseTicketConsulta.registros;
        if (registros && registros.length > 0) {
          const archivoReporte = registros[0].archivoReporte;
          if (archivoReporte && archivoReporte.length > 0) {
              const nomArchivoReporte = archivoReporte[0].nomArchivoReporte;
              res.status(200).json({ nombre_archivo_rep: nomArchivoReporte });
          }else{
              //retornar vacio en proceso
              res.status(200).json({ nombre_archivo_rep: "" });
          }
        }else{
            //retornar vacio en proceso
            res.status(200).json({ nombre_archivo_rep: "" });
        }
        //res.status(200).json(jsonResponseTicketConsulta.registros[0].archivoReporte[0].nomArchivoReporte);
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message }); // Aquí se detiene la ejecución si ocurre un error
    }
};

const generarTicketSireConsulta = async (req, res, next) => {
  const {id_anfitrion,documento_id,periodo,id_libro} = req.body;
  
  //Cambio y Mapeo id_libro por valores sunat3b4
  const libroMap = {
    "014": "140000",
    "008": "080000",
  };
  const parseIdLibro = (id) => libroMap[id] || id;
  const id_libro_parseado = parseIdLibro(id_libro);
  
  try {
      /////////////////////////////////////////////////////////////
      //1: Consultar si existe ticket Generado en BD

      const rowTicket = await generarTicketSireConsultaDB(id_anfitrion,documento_id,periodo,id_libro_parseado);

      //2: Si no existe Ticket BD, generar Ticket Nuevo
      if (rowTicket.length > 0) {
          // Acceder al primer resultado y al campo sire_ticket
          //return rows[0].sire_ticket; // Si solo te interesa el primer valor
          return res.status(200).json({ ticket: rowTicket[0].sire_tpropuesta }); // Aquí se detiene la ejecución si ocurre un error
      } else {
          //Genera ticket desde sunat
          return res.status(200).json({ ticket: '' }); // Aquí se detiene la ejecución si ocurre un error
      }
      //El resto del proceso, se ejecuta en otro EndPoint
     
  } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message }); // Aquí se detiene la ejecución si ocurre un error
  }
};

module.exports = {
    generarTicketSireAdmin,
    generarTicketSireConsulta,
    generarTicketSireEstado,
    generarTicketSireDescarga,
 }; 