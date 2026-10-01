// Helpers de formato compartidos.
//
// Se extrajeron de controllers/ventatrans.controllers.js porque los usan el
// legacy (payload de CPE y de resumen SUNAT) y el nuevo service de tickets.
// Viven aparte para que el service no dependa del controller legacy.

const toIsoDate = (value) => {
  if (!value) return '';
  if (value instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);

    const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  }
  return String(value).split('T')[0].split(' ')[0];
};

// Una columna date de PostgreSQL no tiene zona horaria: el driver la entrega
// como Date a medianoche UTC. Formatearla en America/Lima la corre un dia
// (2026-09-28 se volveria 2026-09-27), asi que aqui se leen sus componentes
// tal como los guardo PostgreSQL. Para timestamps y textos sigue mandando
// toIsoDate, que si necesita la conversion a Lima.
const toIsoDateColumna = (value) => {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).split('T')[0].split(' ')[0];
};

const toIsoTime = (value) => {
  const horaLimaActual = () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());

    const getPart = (type) => parts.find((part) => part.type === type)?.value || '00';
    return `${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  };

  if (!value) return horaLimaActual();

  if (value instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(value);

    const getPart = (type) => parts.find((part) => part.type === type)?.value || '00';
    return `${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  }

  const text = String(value).trim();
  const match = text.match(/(?:^|[T\s])(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return horaLimaActual();

  return `${match[1]}:${match[2]}:${match[3] || '00'}`;
};

const toIsoDateTimeLima = (dateValue, timeValue) => {
  const fecha = toIsoDate(dateValue) || toIsoDate(new Date());
  const hora = toIsoTime(timeValue);
  return `${fecha} ${hora}`;
};

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

module.exports = {
  toIsoDate,
  toIsoDateColumna,
  toIsoTime,
  toIsoDateTimeLima,
  toNumber,
};