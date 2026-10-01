// Capa HTTP de los tickets PDF de encomienda.
//
// Solo normaliza el body (acepta alias con y sin prefijo p_), llama al service
// y responde. Los codigos de estado y los cuerpos son los mismos que antes.
const service = require('../../services/transporte/ticket.service');

const generarTicketPDFEncomiendaExpertcont = async (
  req,
  res,
  endpointTicket = service.TICKET_ENCOMIENDA_ENDPOINT
) => {
  const {
    p_periodo,
    p_id_usuario,
    p_documento_id,
    p_r_cod,
    p_r_serie,
    p_r_numero,
    p_elemento,
    periodo,
    id_usuario,
    id_anfitrion,
    documento_id,
    r_cod,
    r_serie,
    r_numero,
    elemento,
    p_endpoint_pdf,
    endpoint_pdf,
    endpoint
  } = req.body;

  const resultado = await service.generarTicketEncomienda({
    periodo: p_periodo || periodo,
    id_usuario: p_id_usuario || id_usuario || id_anfitrion,
    documento_id: p_documento_id || documento_id,
    r_cod: p_r_cod || r_cod,
    r_serie: p_r_serie || r_serie,
    r_numero: p_r_numero || r_numero,
    elemento: p_elemento ?? elemento ?? 1,
    endpoint_pdf: p_endpoint_pdf || endpoint_pdf || endpoint,
    endpointTicket,
  });

  return res.status(resultado.status).json(resultado.body);
};

const generarTicketAdminPDFEncomiendaExpertcont = async (req, res) => {
  await generarTicketPDFEncomiendaExpertcont(
    req,
    res,
    service.TICKET_ENCOMIENDA_ADMIN_ENDPOINT
  );
};

module.exports = {
  generarTicketPDFEncomiendaExpertcont,
  generarTicketAdminPDFEncomiendaExpertcont,
};