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
  toIsoTime,
  toIsoDateTimeLima,
  toNumber,
};