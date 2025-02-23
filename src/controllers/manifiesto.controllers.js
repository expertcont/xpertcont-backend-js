//Utilizamos conexion auxiliar (Servidor02)
const pool = require('../db02');

const obtenerTodosManifiestoDet = async (req,res,next)=> {
    const {id_empresa,ano,grupo_serie,grupo_numero} = req.body
    try {
        let strSQL;
        strSQL = "SELECT documento_id as scodigo,razon_social as sdescripcion, null as sdescripcion2, null as sdescripcion3 FROM mtc_manifiesto_det";
        strSQL += " WHERE id_empresa = "+ id_empresa;
        strSQL += " AND ano = '"+ ano + "'";
        strSQL += " AND comprobante_grupo_codigo = '33'";
        strSQL += " AND comprobante_grupo_serie = '"+ grupo_serie + "'";
        strSQL += " AND comprobante_grupo_numero = '"+ grupo_numero + "'";
        strSQL += " ORDER BY item ASC";

        const todosBoletos = await pool.query(strSQL);
        res.json(todosBoletos.rows);
    }
    catch(error){
        console.log(error.message);
    }
    //res.send('Listado de todas los zonas');
};
const obtenerManifiestoCarga = async (req,res,next)=> {
    try {
        //Obtiene un numero de manifiesto abierto o cerrado, para carga de datos posterior en frontend
        let result;
        let strSQL;
        const values = [
            req.body.id_empresa,
            req.body.ano,
            req.body.grupo_cod,
            req.body.grupo_serie,
            req.body.grupo_fecha,
            req.body.id_existencia,
            req.body.placa,
            req.body.licencia,
            req.body.chofer,
            req.body.id_punto_venta
        ];
        //Verifica si existe Manifiesto Abierto
        
        strSQL = "select * from f_crear_manifiesto($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)";
        result = await pool.query(strSQL,values);
        
        //Siempre devuelve 1 sola fila
        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const obtenerManifiestoDet = async (req,res,next)=> {
    try {
        //Obtiene un numero de manifiesto abierto o cerrado, para carga de datos posterior en frontend
        let result;
        let strSQL;
        const values = [
            req.body.id_empresa,
            req.body.grupo_cod,
            req.body.grupo_serie,
            req.body.grupo_numero,
            req.body.documento_id
        ];
        //Verifica si existe Manifiesto Abierto
        strSQL = "SELECT id_existencia,cast(precio_neto as varchar)::varchar(10) as precio_neto";
        strSQL += " ,comprobante_original_codigo";
        strSQL += " ,comprobante_original_serie";
        strSQL += " ,comprobante_original_numero";
        strSQL += " ,item";
        strSQL += " ,(select * from fve_convertir_numero_letra(precio_neto,'SOLES'))::varchar(200) as monto_letras";
        strSQL += " FROM mtc_manifiesto_det";
        strSQL += " WHERE id_empresa = $1";
        strSQL += " AND comprobante_grupo_codigo = $2";
        strSQL += " AND comprobante_grupo_serie = $3";
        strSQL += " AND comprobante_grupo_numero = $4";
        strSQL += " AND documento_id = $5"; 
        //console.log(strSQL,values);
        result = await pool.query(strSQL,values);
        
        //Siempre devuelve 1 sola fila
        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearManifiestoDet = async (req,res,next)=> {
    const values = [
        req.body.id_empresa,        //01
        req.body.ano,               //02
        req.body.grupo_codigo,      //03
        req.body.grupo_serie,       //04
        req.body.grupo_numero,      //05
        req.body.grupo_fecha,       //06

        req.body.id_documento,      //07
        req.body.documento_id,      //08
        req.body.razon_social,      //09
        req.body.direccion,         //10
        req.body.id_existencia,     //11
        
        req.body.placa,             //12
        req.body.licencia,          //13

        req.body.id_punto_venta,    //14
        req.body.cod_boleto,        //15
        req.body.serie_boleto       //16
    ];
        
    const strSQL = `
        SELECT f_procesa_agregar_pasajero(
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        ) AS resultado;
        `;

    try {
        // Ejecuta la consulta a la función de PostgreSQL
        const result = await pool.query(strSQL, values);
        const resultado = result.rows[0].resultado;
        //console.log(result);
        // Si la operación fue exitosa, devolver true
        if (resultado) {
            return res.status(200).json({ success: true });
        } else{
            return res.status(400).json({ success: false });
        }
    } catch (error) {
        console.error('Error ejecutando la función:', error);
        // Si hay un error en la base de datos o backend, devuelve false
        return res.status(500).json({ success: false });
    }
};

const eliminarZona = async (req,res,next)=> {
    try {
        const {id} = req.params;
        const result = await pool.query("delete from mve_zona where id_zona = $1",[id]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Zona no encontrada"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};
const actualizarZona = async (req,res,next)=> {
    try {
        const {id} = req.params;
        const {nombre,descripcion,siglas} = req.body
 
        const result = await pool.query("update mve_zona set nombre=$1,descripcion=$2,siglas=$3 where id_zona=$4",[nombre,descripcion,siglas,id]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Zona no encontrada"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

const obtenerManifiestoCabImpresion = async (req,res,next)=> {
    try {
        //Obtiene un numero de manifiesto abierto o cerrado, para carga de datos posterior en frontend
        let result;
        let strSQL;
        const values = [
            req.body.id_empresa,
            req.body.grupo_cod,
            req.body.grupo_serie,
            req.body.grupo_numero
        ];
        //Verifica si existe Manifiesto Abierto
        
        strSQL = "SELECT to_char(mtc_manifiesto.ctrl_insercion,'YYYY-MM-dd HH24:mm:ss') as fsalida";
        strSQL += " ,mst_transporte_licencia.descripcion as dni";
        strSQL += " FROM";
        strSQL += " mtc_manifiesto LEFT JOIN mst_transporte_licencia";
        strSQL += " ON (mtc_manifiesto.id_empresa = mst_transporte_licencia.id_empresa and ";
        strSQL += "     mtc_manifiesto.licencia = mst_transporte_licencia.licencia_conducir )";
        strSQL += " WHERE mtc_manifiesto.id_empresa = $1";
        strSQL += " AND mtc_manifiesto.comprobante_grupo_codigo = $2";
        strSQL += " AND mtc_manifiesto.comprobante_grupo_serie = $3";
        strSQL += " AND mtc_manifiesto.comprobante_grupo_numero = $4";
        result = await pool.query(strSQL,values);
        
        //Siempre devuelve 1 sola fila
        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};
const obtenerManifiestoDetImpresion = async (req,res,next)=> {
    const values = [
        req.body.id_empresa,
        req.body.grupo_cod,
        req.body.grupo_serie,
        req.body.grupo_numero
    ];

    try {
        let strSQL;
        strSQL = "SELECT documento_id,razon_social,precio_neto,comprobante_original_serie,comprobante_original_numero FROM mtc_manifiesto_det";
        strSQL += " WHERE id_empresa = $1";
        strSQL += " AND comprobante_grupo_codigo = $2";
        strSQL += " AND comprobante_grupo_serie = $3";
        strSQL += " AND comprobante_grupo_numero = $4";
        strSQL += " ORDER BY item ASC";

        const todosBoletos = await pool.query(strSQL,values);
        res.json(todosBoletos.rows);
    }
    catch(error){
        console.log(error.message);
    }
    //res.send('Listado de todas los zonas');
};

const obtenerPlacasManifiesto = async (req,res,next)=> {
    //NO usamos parametros
    try {
        let strSQL;
        strSQL = "select mst_transporte_unidad.vehiculo_placa as scodigo,";
        strSQL += " mst_transporte_unidad.vehiculo_marca as sdescripcion,";
        strSQL += " mst_transporte_licencia.licencia_conducir as sdescripcion2,";
        strSQL += " mst_transporte_licencia.nombre as sdescripcion3";
        strSQL += " from mst_transporte_unidad left join mst_transporte_licencia";
        strSQL += " on ( mst_transporte_unidad.id_empresa = mst_transporte_licencia.id_empresa and";
        strSQL += "      mst_transporte_unidad.vehiculo_configuracion = mst_transporte_licencia.licencia_conducir )";
        strSQL += " order by mst_transporte_unidad.vehiculo_placa asc";

        const todosRegistros = await pool.query(strSQL);
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerLicenciasManifiesto = async (req,res,next)=> {
    //NO usamos parametros
    try {
        let strSQL;
        strSQL = "SELECT licencia_conducir as scodigo, nombre as sdescripcion,";
        strSQL += " null as sdescripcion2, null as sdescripcion3 ";
        strSQL += " FROM mst_transporte_licencia ";
        strSQL += " ORDER BY nombre ASC";

        const todosRegistros = await pool.query(strSQL);
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerDestinosManifiesto = async (req,res,next)=> {
    const values = [
        req.body.id_punto_venta
    ];

    try {
        let strSQL;
        strSQL = "SELECT id_existencia as scodigo, nombre as sdescripcion, null as sdescripcion2, null as sdescripcion3 FROM mst_existencia";
        strSQL += " WHERE id_punto_venta_base = $1";

        const todosRegistros = await pool.query(strSQL,values);
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerConexionInicial = async (req,res,next)=> {
    //obtiene Serie Manifiesto, Serie Boleteo
    const values = [
        req.body.id_punto_venta
    ];

    try {
        let strSQL;
        strSQL = "SELECT * FROM f_carga_conexion_inicial($1)";
        console.log(strSQL,values);
        const todosRegistros = await pool.query(strSQL,values);
        //res.json(todosRegistros.rows);
        res.json(todosRegistros.rows[0]);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerCierreManifiesto = async (req,res,next)=> {
    const values = [
        req.body.id_empresa,        //01
        req.body.id_punto_venta,      //02
        req.body.grupo_serie,       //03
        req.body.grupo_numero      //04
    ];
        
    const strSQL = `
        SELECT f_cerrar_manifiesto(
            $1, $2, $3, $4
        ) AS resultado;
        `;

    try {
        // Ejecuta la consulta a la función de PostgreSQL
        console.log(strSQL, values);
        const result = await pool.query(strSQL, values);
        const resultado = result.rows[0].resultado;
        console.log(result);
        // Si la operación fue exitosa, devolver true
        if (resultado) {
            return res.status(200).json({ success: true });
        } else{
            console.log('no encontro manifiesto');
            return res.status(400).json({ success: false });
        }
    } catch (error) {
        console.log(error);
        console.error('Error ejecutando la función:', error);
        // Si hay un error en la base de datos o backend, devuelve false
        return res.status(500).json({ success: false });
    }
};

module.exports = {
    obtenerTodosManifiestoDet,
    obtenerManifiestoCarga,
    crearManifiestoDet,
    obtenerManifiestoDet,
    obtenerManifiestoCabImpresion,
    obtenerManifiestoDetImpresion,
    obtenerPlacasManifiesto,
    obtenerLicenciasManifiesto,
    obtenerDestinosManifiesto,
    obtenerConexionInicial,
    obtenerCierreManifiesto,
    eliminarZona,
    actualizarZona
 }; 