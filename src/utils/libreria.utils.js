
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
  };

  function convertirFechaStringComplete(dateString) {
    if (!dateString) {
      return 'NULL';  // O ajusta según tus necesidades si quieres manejar fechas vacías de manera diferente
    }
  
    // Si la fecha es un número, la tratamos como una fecha en formato Excel (número de días desde 1900-01-01)
    if (typeof dateString === 'number') {
      const excelDate = new Date((dateString - 1) * 86400000);  // 86400000 milisegundos por día
      const year = excelDate.getUTCFullYear();
      const month = excelDate.getUTCMonth() + 1;  // Los meses en JavaScript son de 0 a 11
      const day = excelDate.getUTCDate();
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  
    // Si no es un número, asumimos que ya está en el formato deseado (DD/MM/YYYY)
    const [day, month, year] = dateString.split('/');
    return `${year}-${month}-${day}`;
  };
  
  module.exports = {
    devuelveCadenaNull,
    devuelveNumero,
    convertirFechaString,
    convertirFechaStringComplete
  };
  