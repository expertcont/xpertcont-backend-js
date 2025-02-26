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
        //1: Obtener token
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
        console.log('Respuesta:', jsonResponse.access_token);
        //res.json(jsonResponse.access_token);

        /////////////////////////////////////////////////////////////
        //2: Obtener Ano y Mes historial pendientes y declarados
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
        // Verificar el estado de la respuesta
        //if (!responsePeriodos.ok) {
        //    throw new Error(`Error HTTP: ${responsePeriodos.status}`);
        //}
        // Analizar la respuesta como JSON
        const jsonResponsePeriodos = await responsePeriodos.json();
        console.log('Respuesta Periodos:', jsonResponsePeriodos);        
        res.json(jsonResponsePeriodos);

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message }); // Aquí se detiene la ejecución si ocurre un error
    }
};

module.exports = {
    generarTicketSire,
 }; 