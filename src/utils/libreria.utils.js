
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
  
  module.exports = {
    devuelveCadenaNull,
    devuelveNumero
  };
  