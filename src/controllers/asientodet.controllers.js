const pool = require('../db');

const obtenerTodosAsientosDet = async (req,res,next)=> {
    let strSQL;
    const {id_anfitrion,documento_id,periodo,id_libro} = req.params;

    strSQL = "SELECT * ";
    strSQL = strSQL + " FROM mct_asientocontabledet ";
    strSQL = strSQL + " WHERE id_usuario = $1";
    strSQL = strSQL + " AND documento_id = $2";
    strSQL = strSQL + " AND periodo = $3";
    strSQL = strSQL + " AND id_libro = $4";
    strSQL = strSQL + " ORDER BY item";

    try {
        const todosReg = await pool.query(strSQL,[id_anfitrion,documento_id,periodo,id_libro]);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
    //res.send('Listado de todas los zonas');
};

const obtenerAsientoDet = async (req,res,next)=> {
    //DEtalles de un Pedido
    try {
        const {id_anfitrion,documento_id,periodo,id_libro,num_asiento} = req.params;
        let strSQL ;

        strSQL = "select mct_asientocontabledet.*, mct_cuentacontable.descripcion";
        strSQL += " from mct_asientocontabledet left join mct_cuentacontable";
        strSQL += " on (mct_asientocontabledet.id_cuenta = mct_cuentacontable.id_cuenta and";
        strSQL += "     mct_asientocontabledet.id_usuario = mct_cuentacontable.id_usuario)";
        strSQL += " where mct_asientocontabledet.id_usuario = $1";
        strSQL += " and mct_asientocontabledet.documento_id = $2";
        strSQL += " and mct_asientocontabledet.periodo = $3";
        strSQL += " and mct_asientocontabledet.id_libro = $4";
        strSQL += " and mct_asientocontabledet.num_asiento = $5";
        strSQL += " and mct_asientocontabledet.id_cuenta not like '104%'";
        
        strSQL += " union all";
        
        strSQL += " select mct_asientocontabledet.*, mct_cuentacontable_det.descripcion";
        strSQL += " from mct_asientocontabledet left join mct_cuentacontable_det";
        strSQL += " on (mct_asientocontabledet.id_cuenta = mct_cuentacontable_det.id_cuenta and";
        strSQL += "     mct_asientocontabledet.id_usuario = mct_cuentacontable_det.id_usuario)";
        strSQL += " where mct_asientocontabledet.id_usuario = $1";
        strSQL += " and mct_asientocontabledet.documento_id = $2";
        strSQL += " and mct_asientocontabledet.periodo = $3";
        strSQL += " and mct_asientocontabledet.id_libro = $4";
        strSQL += " and mct_asientocontabledet.num_asiento = $5";
        strSQL += " and mct_asientocontabledet.id_cuenta like '104%'";
        
        strSQL += " order by item";
        
        console.log(strSQL,[id_anfitrion,documento_id,periodo,id_libro,num_asiento]);
        
        const result = await pool.query(strSQL,[id_anfitrion,documento_id,periodo,id_libro,num_asiento]);
        
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

const obtenerAsientoDetItem = async (req,res,next)=> {
    //Detalles de un Pedido
    try {
        const {id_anfitrion,documento_id,periodo,id_libro,num_asiento,item} = req.params;
        let strSQL ;
        strSQL = "SELECT * ";
        strSQL = strSQL + " FROM mct_asientocontabledet ";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND documento_id = $2";
        strSQL = strSQL + " AND periodo = $3";
        strSQL = strSQL + " AND id_libro = $4";
        strSQL = strSQL + " AND num_asiento = $5";
        strSQL = strSQL + " AND item = $6";
        //console.log(strSQL,[id_anfitrion,documento_id,periodo,id_libro,num_asiento,item]);
        
        const result = await pool.query(strSQL,[id_anfitrion,documento_id,periodo,id_libro,num_asiento,item]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Item no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearAsientoDet = async (req,res,next)=> {
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

    strSQL = "INSERT INTO mct_asientocontabledet";
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

const eliminarAsientoDet = async (req,res,next)=> {
    try {
        const {id_anfitrion,documento_id,periodo,id_libro,num_asiento,item} = req.params;
        var strSQL;
        strSQL = "DELETE FROM mct_asientocontabledet ";
        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND documento_id = $2";
        strSQL = strSQL + " AND periodo = $3";
        strSQL = strSQL + " AND id_libro = $4";
        strSQL = strSQL + " AND num_asiento = $5";
        strSQL = strSQL + " AND item = $6";
        const result = await pool.query(strSQL,[id_anfitrion,documento_id,periodo,id_libro,num_asiento,item]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Venta no encontrada"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

const actualizarAsientoDet = async (req,res,next)=> {
    try {
        const {cod,serie,num,elem,item} = req.params;
        const { 
                ref_documento_id,   //01
                ref_razon_social,   //02
                id_zona_entrega,    //03
                zona_entrega,       //04
                id_producto,        //05
                descripcion,        //06
                precio_unitario,    //07
                porc_igv,           //08
                cantidad,           //09
                ref_observacion,    //10
                ref_direccion,      //11
                unidad_medida,      //12
                fecha_entrega2      //13
            } = req.body        
 
        var strSQL;
        strSQL = "UPDATE mve_venta_detalle SET ";
        strSQL = strSQL + "  ref_documento_id = $1";
        strSQL = strSQL + " ,ref_razon_social = $2";
        strSQL = strSQL + " ,id_zona_entrega = $3";
        strSQL = strSQL + " ,zona_entrega = $4";
        strSQL = strSQL + " ,id_producto = $5";
        strSQL = strSQL + " ,descripcion = $6";
        strSQL = strSQL + " ,precio_unitario = $7";
        strSQL = strSQL + " ,porc_igv = $8";
        strSQL = strSQL + " ,cantidad = $9";
        strSQL = strSQL + " ,ref_observacion = $10";
        strSQL = strSQL + " ,ref_direccion = $11";
        strSQL = strSQL + " ,unidad_medida = $12";
        strSQL = strSQL + " ,fecha_entrega = $13";

        strSQL = strSQL + " WHERE comprobante_original_codigo = $14";
        strSQL = strSQL + " AND comprobante_original_serie = $15";
        strSQL = strSQL + " AND comprobante_original_numero = $16";
        strSQL = strSQL + " AND elemento = $17";
        strSQL = strSQL + " AND item = $18";
 
        const result = await pool.query(strSQL,
        [   
            ref_documento_id,   //01
            ref_razon_social,   //02
            id_zona_entrega,    //03
            zona_entrega,       //04
            id_producto,        //05
            descripcion,        //06
            precio_unitario,    //07
            porc_igv,           //08
            cantidad,           //09
            ref_observacion,    //10
            ref_direccion,      //11
            unidad_medida,      //12
            fecha_entrega2,     //13

            cod,    //14 param
            serie,  //15 param
            num,    //16 param
            elem,   //17 param
            item    //18 param
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
    obtenerTodosAsientosDet,
    obtenerAsientoDet,
    obtenerAsientoDetItem,
    crearAsientoDet,
    eliminarAsientoDet,
    actualizarAsientoDet
 }; 