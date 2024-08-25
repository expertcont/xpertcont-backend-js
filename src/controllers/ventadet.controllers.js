const pool = require('../db');

const obtenerVentaDet = async (req,res,next)=> {
    //Detalles de un Pedido
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,elem} = req.params;
        let strSQL ;
        strSQL = "SELECT * ";
        strSQL += " FROM mve_ventadet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        strSQL += " ORDER BY item";
        //console.log(strSQL,[cod,serie,num,elem]);
        
        const result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem]);
        
        //eSTE MENSAJE DE VENTGA NO ENCONTRADA, CONFUNDE AL BUCLE PARA RENDERIZAR LOS DATOS
        //MEJOR QUE SALGA ARRAY VACIO, AL MENOS ASI ENTIENDE QUE NO HAY NADA
        /*if (result.rows.length === 0)
            return res.status(404).json({
                message:"Venta no encontrada"
            });*/

        //res.json(result.rows[0]);
        res.json(result.rows);
    } catch (error) {
        console.log(error.message);
    }
};

const obtenerVentaDetItem = async (req,res,next)=> {
    //DEtalles de un Pedido
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,elem,item} = req.params;
        let strSQL ;
        strSQL = "SELECT * ";
        strSQL += " FROM mve_ventadet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        strSQL += " AND item = $8";
        strSQL += " ORDER BY item";
        //console.log(strSQL,[cod,serie,num,elem,item]);
        
        const result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem,item]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Item no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearVentaDet = async (req,res,next)=> {
    let strSQL;
    const {
        id_empresa,         //01
        id_punto_venta,     //02
        comprobante_original_codigo, //03
        comprobante_original_serie,  //04
        comprobante_original_numero, //05
        ref_documento_id,   //06
        ref_razon_social,   //07
        id_zona_entrega,    //08
        zona_entrega,       //09
        id_producto,            //10
        descripcion,        //11
        comprobante_original_fecemi, //12
        precio_unitario,    //13
        porc_igv,           //14
        cantidad,           //15
        ref_observacion,  //16
        registrado,          //17
        ref_direccion,          //18
        unidad_medida,          //19

        fecha_entrega2,          //20  24
        moneda          //21   25 new
        } = req.body
    //COD = Procesar zona_venta, para extraer siglas (LCH-LIMA) => LCH
    //SERIE = Procesar comprobante_original_fecemi, para extraer mes (28/10/2022) => 10

    //console.log(comprobante_original_fecemi);
    //cuidado con edicion manual de la fecha, se registra al reves, pero en caso de click va normal
    let datePieces = comprobante_original_fecemi.split("-");
    const fechaArmada = new Date(datePieces[0],datePieces[1],datePieces[2]); //ok con hora 00:00:00
    //console.log(datePieces);
    let sAno = (fechaArmada.getFullYear()).toString(); // new 

    strSQL = "INSERT INTO mve_venta_detalle";
    strSQL = strSQL + " (";
    strSQL = strSQL + "  id_empresa";
    strSQL = strSQL + " ,id_punto_venta";
    strSQL = strSQL + " ,ano"; //new
    strSQL = strSQL + " ,comprobante_original_codigo";
    strSQL = strSQL + " ,comprobante_original_serie";
    strSQL = strSQL + " ,comprobante_original_numero";
    strSQL = strSQL + " ,elemento";
    strSQL = strSQL + " ,item";
    strSQL = strSQL + " ,ref_documento_id";
    strSQL = strSQL + " ,ref_razon_social";
    strSQL = strSQL + " ,id_zona_entrega";
    strSQL = strSQL + " ,zona_entrega";
    strSQL = strSQL + " ,id_producto";
    strSQL = strSQL + " ,descripcion";
    strSQL = strSQL + " ,comprobante_original_fecemi";
    strSQL = strSQL + " ,precio_unitario";
    strSQL = strSQL + " ,porc_igv";
    strSQL = strSQL + " ,cantidad";
    strSQL = strSQL + " ,ref_observacion";
    strSQL = strSQL + " ,registrado";
    strSQL = strSQL + " ,ref_direccion";
    strSQL = strSQL + " ,unidad_medida";

    strSQL = strSQL + " ,fecha_entrega";
    strSQL = strSQL + " ,moneda"; //new
    strSQL = strSQL + " ,estado";

    strSQL = strSQL + " )";
    strSQL = strSQL + " VALUES";
    strSQL = strSQL + " (";
    strSQL = strSQL + "  $1";
    strSQL = strSQL + " ,$2";
    strSQL = strSQL + " ,'" + sAno + "'"; //new
    strSQL = strSQL + " ,$3";
    strSQL = strSQL + " ,$4";
    strSQL = strSQL + " ,$5";
    strSQL = strSQL + ",1"; //elemento
    //cuidado aqui en esta funcion hay que aumenta el año,. para generar toodo, le aumentamos arriba pero aqui en el item, aun mno lo esta considerando chingados
    strSQL = strSQL + " ,(select * from fve_genera_venta_item(1,'" + comprobante_original_codigo + "','" + comprobante_original_serie + "','" + comprobante_original_numero + "',1))"; //item
    strSQL = strSQL + " ,$6";
    strSQL = strSQL + " ,$7";
    strSQL = strSQL + " ,$8";
    strSQL = strSQL + " ,$9";
    strSQL = strSQL + " ,$10";
    strSQL = strSQL + " ,$11";
    strSQL = strSQL + " ,$12";
    strSQL = strSQL + " ,$13";
    strSQL = strSQL + " ,$14";
    strSQL = strSQL + " ,$15";
    strSQL = strSQL + " ,$16";
    strSQL = strSQL + " ,$17";
    strSQL = strSQL + " ,$18";
    strSQL = strSQL + " ,$19";

    strSQL = strSQL + " ,$20";
    strSQL = strSQL + " ,$21"; //new moneda (S/ ó USD)
    strSQL = strSQL + " ,'PENDIENTE'";//NEW
    strSQL = strSQL + " ) RETURNING *";
    try {
        //console.log(strSQL);
        const result = await pool.query(strSQL, 
        [   
            id_empresa,         //01
            id_punto_venta,     //02
            comprobante_original_codigo, //03
            comprobante_original_serie,  //04
            comprobante_original_numero, //05
            ref_documento_id,   //06
            ref_razon_social,   //07
            id_zona_entrega,    //08
            zona_entrega,       //09
            id_producto,        //10
            descripcion,        //11
            comprobante_original_fecemi, //12
            precio_unitario,    //13
            porc_igv,           //14
            cantidad,           //15
            ref_observacion,    //16
            registrado,          //17
            ref_direccion,      //18
            unidad_medida,      //19
            
            fecha_entrega2,     //20      24
            moneda              //21      25 new moneda
        ]
        );
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const eliminarVentaDet = async (req,res,next)=> {
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,elem,item} = req.params;
        let strSQL;
        strSQL = "DELETE FROM mve_ventadet ";
        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        if (item!="-"){
            strSQL += " AND item = $8";
            const result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem,item]);
        }else{
            const result = await pool.query(strSQL,[periodo,id_anfitrion,documento_id,cod,serie,num,elem]);
        }

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Venta no encontrada"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

const actualizarVentaDet = async (req,res,next)=> {
    try {
        const {periodo,id_anfitrion,documento_id,cod,serie,num,elem,item} = req.params; //08 parametros
        const { 
                id_producto,        //09
                descripcion,        //10
                precio_unitario,    //11
                porc_igv,           //12
                cantidad,           //13
                unidad_medida,      //14
                fecha_entrega2,     //15
                moneda              //16
            } = req.body        
 
        let strSQL;
        strSQL = "UPDATE mve_ventadet SET ";
        strSQL += " ,id_producto = $5";
        strSQL += " ,descripcion = $6";
        strSQL += " ,precio_unitario = $7";
        strSQL += " ,porc_igv = $8";
        strSQL += " ,cantidad = $9";
        strSQL += " ,unidad_medida = $12";
        strSQL += " ,fecha_entrega = $13";
        strSQL += " ,moneda = $14";

        strSQL += " WHERE periodo = $1";
        strSQL += " AND id_usuario = $2";
        strSQL += " AND documento_id = $3";
        strSQL += " AND r_cod = $4";
        strSQL += " AND r_serie = $5";
        strSQL += " AND r_numero = $6";
        strSQL += " AND elemento = $7";
        strSQL += " AND item = $8";
 
        const result = await pool.query(strSQL,
        [   
            periodo,        //01
            id_anfitrion,   //02
            documento_id,   //03
            cod,            //04
            serie,          //05
            num,            //06
            elem,           //07
            item,           //08

            id_producto,        //05
            descripcion,        //06
            precio_unitario,    //07
            porc_igv,           //08
            cantidad,           //09
            unidad_medida,      //12
            fecha_entrega2,     //13
            moneda,     //14 new
        ]
        );

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Detalle de venta no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

module.exports = {
    obtenerVentaDet,
    obtenerVentaDetItem,
    crearVentaDet,
    eliminarVentaDet,
    actualizarVentaDet
 }; 