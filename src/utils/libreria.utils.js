
const devuelveCadenaNull = (value) => {
    //Obligatorio devuelve una cadena, así sea undefined o null
    if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return null;
    } else {
      return value;
    }
  };

  const devuelveCadena = (value) => {
    //Obligatorio devuelve una cadena, así sea undefined o null
    if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return '';
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
    if (dateString===null) {
      //console.log("vacio de undefined");
      return '';
    }

    if (dateString===undefined) {
      //console.log("vacio de undefined");
      return '';
    }
    // Si la fecha es una cadena vacía, representamos una fecha nula según lo que requiera tu base de datos
    if (dateString.toString().trim() === '') {
      //console.log("vacio de vacio ;)");
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

    //el formato deseado (YYYY-MM-DD) ... entonces
    //procesamos la fecha en cualquier orden, (solo el mes va en el medio)
    const dateStringFormateado = formatearFecha(dateString);
    console.log(dateString,'procesado: ',dateStringFormateado);
    return dateStringFormateado;
    //Aqui si es la cabecera(text = fecha, emision, etc), lo procesara como fecha, cuidado
  };
  function corregirTCPEN(sValor,sMoneda) {
    //Arregla tipo de cambio=1, para PEN, asi el usuario se equivoque, sistema corrige
    if (sValor===undefined) {
      //console.log("vacio de undefined");
      return '';
    }
    // Si la fecha es una cadena vacía, representamos una fecha nula según lo que requiera tu base de datos
    if (sValor.toString().trim() === '') {
      //console.log("vacio de vacio ;)");
      return '';  // O ajusta según lo que requiera tu base de datos para representar una fecha nula
    }
    if (sValor.toString().trim() === '1') {
      //console.log("sMoneda: ", sMoneda);
      if (sMoneda.trim() ==='PEN'){
        return '';  // O ajusta según lo que requiera tu base de datos para representar una fecha nula  
      }
    }
  
    return sValor;
    //Aqui si es la cabecera(text = fecha, emision, etc), lo procesara como fecha, cuidado
  };

  function formatearFecha(inputFecha) {
    // Reemplazar los guiones con barras para tener un formato consistente
    let fechaConBarras = inputFecha.replace(/-/g, '/');
  
    // Dividir la cadena de fecha en partes
    let partesFecha = fechaConBarras.split('/');
  
    // Verificar el formato original y extraer día, mes y año
    let dia, mes, anio;
    if (partesFecha[0].length === 4) {
      // Formato yyyy/mm/dd
      anio = partesFecha[0];
      mes = partesFecha[1];
      dia = partesFecha[2];
    } else {
      // Formato dd/mm/yyyy
      dia = partesFecha[0];
      mes = partesFecha[1];
      anio = partesFecha[2];
    }
  
    // Formatear la fecha y retornarla
    let fechaFormateada = `${anio}-${mes}-${dia}`;
    return fechaFormateada;
  }
 
  module.exports = {
    devuelveCadenaNull,
    devuelveCadena,    
    devuelveNumero,
    convertirFechaString,
    convertirFechaStringComplete,
    corregirTCPEN,
    formatearFecha
  };
  