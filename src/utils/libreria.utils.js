
const devuelveCadenaNull = (value) => {
    //Obligatorio devuelve una cadena, así sea undefined o null
    if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return null;
    } else {
      return value;
    }
  };
  
  const devuelveNumero = (value) => {
    //Obligatorio devuelve número o cero, así sea (undefined - cadena vacía - null)
    if (value === undefined || (typeof value === 'string' && value.trim() === '') || value === null) {
      return 0;
    } else {
      return value;
    }
  };
  
  function convertirFechaString(dateString) {
    if (!dateString) {
      return 'NULL';  // O ajusta según tus necesidades si quieres manejar fechas vacías de manera diferente
    }
  
    const [day, month, year] = dateString.split('/');
    return `${year}-${month}-${day}`;
  }
  module.exports = {
    devuelveCadenaNull,
    devuelveNumero,
    convertirFechaString
  };
  