const pool = require('../db');

const obtenerMovimientoDet = async (req,res,next)=> {
    //Detalles de un Pedido
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num} = req.params;
        let strSQL;
        strSQL = "SELECT * ";
        strSQL += " FROM mst_movimientodet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND cod = $4";
        strSQL += " AND serie = $5";
        strSQL += " AND numero = $6";
        strSQL += " ORDER BY item";
        //console.log(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem]);
        
        const result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num]);
        
        //eSTE MENSAJE DE VENTGA NO ENCONTRADA, CONFUNDE AL BUCLE PARA RENDERIZAR LOS DATOS
        //MEJOR QUE SALGA ARRAY VACIO, AL MENOS ASI ENTIENDE QUE NO HAY NADA
        /*if (result.rows.length === 0)
            return res.status(404).json({
                message:"Movimiento no encontrada"
            });*/

        //res.json(result.rows[0]);
        res.json(result.rows);
    } catch (error) {
        console.log(error.message);
    }
};

const obtenerMovimientoDetItem = async (req,res,next)=> {
    //DEtalles de un Pedido
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,item} = req.params;
        let strSQL ;
        strSQL = "SELECT * ";
        strSQL += " FROM mst_movimientodet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND cod = $4";
        strSQL += " AND serie = $5";
        strSQL += " AND numero = $6";
        strSQL += " AND item = $7";
        strSQL += " ORDER BY item";
        //console.log(strSQL,[cod,serie,num,elem,item]);
        
        const result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,item]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Item no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearMovimientoDet = async (req,res,next)=> {
    const values = [
        req.body.id_anfitrion,      //01
        req.body.documento_id,      //02
        req.body.periodo,           //03
        req.body.cod,             //04
        req.body.serie,           //05
        req.body.numero,          //06
        req.body.fecemi,          //07
        
        req.body.id_producto,       //08
        req.body.descripcion,       //09
        req.body.cantidad,          //10
        req.body.precio_unitario,   //11
        req.body.precio_neto,       //12
        req.body.porc_igv,          //13
        req.body.cont_und           //14
    ];
        
    const strSQL = `
        SELECT public.fst_movimientodetinserta(
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        ) AS resultado;
        `;

    try {
        // Ejecuta la consulta a la función de PostgreSQL
        console.log(strSQL, values);

        const result = await pool.query(strSQL, values);
        const resultado = result.rows[0].resultado;
        
        console.log(resultado);
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

const eliminarMovimientoDet = async (req,res,next)=> {
    const values = [
        req.params.id_anfitrion,      //01
        req.params.documento_id,      //02
        req.params.periodo,           //03
        req.params.cod,             //04
        req.params.serie,           //05
        req.params.num,             //06
        req.params.item             //07
    ];
        
    const strSQL = `
        SELECT public.fve_movimientodetelimina(
            $1, $2, $3, $4, $5, $6, $7
        ) AS resultado;
        `;
    //console.log(strSQL);
    //console.log(values);
    try {
        // Ejecuta la consulta a la función de PostgreSQL
        const result = await pool.query(strSQL, values);
        const resultado = result.rows[0].resultado;

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

const actualizarMovimientoDet = async (req,res,next)=> {
    const values = [
        req.params.id_anfitrion,    //01
        req.params.documento_id,    //02
        req.params.periodo,         //03
        req.params.cod,             //04
        req.params.serie,           //05
        req.params.num,             //06
        req.params.item,            //07
        
        req.body.descripcion,       //08
        req.body.cantidad,          //09
        req.body.precio_unitario,   //10
        req.body.precio_neto        //11
    ];
        
    const strSQL = `
        SELECT public.fve_movimientodetactualiza(
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        ) AS resultado;
        `;

    try {
        // Ejecuta la consulta a la función de PostgreSQL
        const result = await pool.query(strSQL, values);
        const resultado = result.rows[0].resultado;

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

module.exports = {
    obtenerMovimientoDet,
    obtenerMovimientoDetItem,
    crearMovimientoDet,
    eliminarMovimientoDet,
    actualizarMovimientoDet
 }; 