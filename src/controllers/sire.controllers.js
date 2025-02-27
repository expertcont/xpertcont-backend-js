const pool = require('../db');
const xlsx = require('xlsx');
const { Readable } = require('stream');
const {devuelveCadenaNull,devuelveNumero, convertirFechaString, convertirFechaStringComplete, corregirTCPEN, corregirMontoNotaCredito} = require('../utils/libreria.utils');
const { from: copyFrom } = require('pg-copy-streams');
const { pipeline } = require('node:stream/promises');
const fetch = require('node-fetch');

const generarTicketSireCredenciales = async (id_anfitrion,documento_id) => {
  const strSQL = `
      SELECT sire_id,sire_secret,sire_sol,sire_solpwd FROM mad_usuariocontabilidad
      WHERE id_usuario = $1
      AND documento_id = $2
  `;
  const { rows } = await pool.query(strSQL, [id_anfitrion,documento_id]);
  return rows;
};
const generarTicketSire = async (req, res, next) => {
    const {id_anfitrion,documento_id,id_libro,periodo} = req.body;
    
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
        //console.log('Respuesta:', jsonResponse.access_token);
        //res.json(jsonResponse.access_token);

        /////////////////////////////////////////////////////////////
        //2: Api sunat 5.2  (Obtener Ano y Mes historial pendientes y declarados)
        const sUrlSunatPeriodosLista = `
        https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/padron/web/omisos/${id_libro}/periodos
        `;
        const options = {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${jsonResponse.access_token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        };
        const responsePeriodos = await fetch(sUrlSunatPeriodosLista, options);
        const jsonResponsePeriodos = await responsePeriodos.json();
        //console.log('Respuesta Periodos:', jsonResponsePeriodos);        
        //res.json(jsonResponsePeriodos);

        /////////////////////////////////////////////////////////////
        //3: API sunat 5.18 descargar propuesta (Solo numero Ticket)
        //Cuidado con el Periodo
        const periodoFormateado = periodo.replace(/-/g, '');
        const sUrlSunatTicket = `
        https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvie/propuesta/web/propuesta/${periodoFormateado}/exportapropuesta?codTipoArchivo=0
        `;
        const responseTicket = await fetch(sUrlSunatTicket, options);
        const jsonResponseTicket = await responseTicket.json();
        //Esto se recomienda guardar en BD, esta relacionado con el periodo que se desea descargar (creo q se queda guardado en la nube del SIRE)
        //res.json(jsonResponseTicket);
        
        /////////////////////////////////////////////////////////////
        //4: API sunat 5.16 Consultar Ticket (Parametros de tamaño datos y demas generales)
        const sUrlSunatTicketConsulta = `
        https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/consultaestadotickets?perIni=${periodoFormateado}&perFin=${periodoFormateado}&page=1&perPage=20&numTicket=${jsonResponseTicket.numTicket}
        `;
        const responseTicketConsulta = await fetch(sUrlSunatTicketConsulta, options);
        const jsonResponseTicketConsulta = await responseTicketConsulta.json();
        console.log('Estado Ticket Consulta:', jsonResponseTicketConsulta);
        res.json(jsonResponseTicketConsulta);
        

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message }); // Aquí se detiene la ejecución si ocurre un error
    }
};

const generarTicketSireDescarga = async (req, res, next) => {
  const {id_anfitrion,documento_id,id_libro,periodo,ticket,nombre_archivo_rep} = req.body;
  
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
      https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/archivoreporte?nomArchivoReporte=${nombre_archivo_rep}&codTipoArchivoReporte=01&codLibro=${id_libro}&perTributario=${periodoFormateado}&codProceso=10&numTicket=${ticket}
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

module.exports = {
    generarTicketSire,
    generarTicketSireDescarga,
 }; 