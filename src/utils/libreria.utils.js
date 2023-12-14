
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

  function convertirFechaStringComplete(dateString,bOrigenSire) {
    if (dateString===undefined) {
      console.log("vacio de undefined");
      return '';
    }
    // Si la fecha es una cadena vacía, representamos una fecha nula según lo que requiera tu base de datos
    if (dateString.toString().trim() === '') {
      console.log("vacio de vacio ;)");
      return '';  // O ajusta según lo que requiera tu base de datos para representar una fecha nula
    }
  
    // Si la fecha es un número, la tratamos como una fecha en formato Excel (número de días desde 1900-01-01)
    if (typeof dateString === 'number') {
      const excelDate = new Date((dateString - 25569) * 86400000);  // Ajuste para la diferencia de días entre Excel y JavaScript
      const year = excelDate.getUTCFullYear();
      const month = excelDate.getUTCMonth() + 1;  // Los meses en JavaScript son de 0 a 11
      const day = excelDate.getUTCDate();
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    // Si no es un número, asumimos que ya está en el formato deseado (DD/MM/YYYY)
    if (bOrigenSire){
        //pinche sire devuelve yyyy/mm/dd,
      const [year_sire, month_sire, day_sire] = dateString.split('/');
      return `${year_sire}-${month_sire}-${day_sire}`;
    }else{
      const [day, month, year] = dateString.split('/');
      return `${year}-${month}-${day}`;
    }
    //Aqui si es la cabecera(text = fecha, emision, etc), lo procesara como fecha, cuidado
  };

  module.exports = {
    devuelveCadenaNull,
    devuelveNumero,
    convertirFechaString,
    convertirFechaStringComplete
  };
  