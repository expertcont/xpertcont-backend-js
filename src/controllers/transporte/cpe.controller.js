// Capa HTTP del envio individual de CPE de encomienda.
//
// Solo req/res y el status de respuesta. El frontend sigue llamando exactamente
// la misma URL con los mismos parametros.
const service = require('../../services/transporte/cpe.service');

const generarCPEexpertcontTransporte = async (req, res) => {
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
    elemento
  } = req.body;

  const periodoFinal = p_periodo || periodo;
  const idUsuarioFinal = p_id_usuario || id_usuario || id_anfitrion;
  const documentoIdFinal = p_documento_id || documento_id;
  const rCodFinal = p_r_cod || r_cod;
  const rSerieFinal = p_r_serie || r_serie;
  const rNumeroFinal = p_r_numero || r_numero;
  const elementoFinal = p_elemento ?? elemento ?? 1;

  if (
    !periodoFinal ||
    !idUsuarioFinal ||
    !documentoIdFinal ||
    !rCodFinal ||
    !rSerieFinal ||
    !rNumeroFinal ||
    elementoFinal === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para enviar encomienda a SUNAT'
    });
  }

  const respuesta = await service.generarCPEexpertcontTransporte({
    periodo: periodoFinal,
    idUsuario: idUsuarioFinal,
    documentoId: documentoIdFinal,
    rCod: rCodFinal,
    rSerie: rSerieFinal,
    rNumero: rNumeroFinal,
    elemento: elementoFinal,
    ctrlModUs: req.body.id_invitado || req.body.ctrl_mod_us || null,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

module.exports = {
  generarCPEexpertcontTransporte,
};
