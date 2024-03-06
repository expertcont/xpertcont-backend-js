const pool = require('../db');
//const { param } = require('../routes/asientodet.routes');
const {devuelveCadenaNull,devuelveNumero, convertirFechaString, convertirFechaStringComplete, corregirTCPEN} = require('../utils/libreria.utils');

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
        strSQL += ",(mct_asientocontabledet.r_cod || '-' || mct_asientocontabledet.r_serie || '-' || mct_asientocontabledet.r_numero)::varchar(50) as comprobante";
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
        strSQL += ",(mct_asientocontabledet.r_cod || '-' || mct_asientocontabledet.r_serie || '-' || mct_asientocontabledet.r_numero)::varchar(50) as comprobante";
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

        strSQL = "select mct_asientocontabledet.*";
        strSQL += " ,(mct_asientocontabledet.r_cod || '-' || mct_asientocontabledet.r_serie || '-' || mct_asientocontabledet.r_numero)::varchar(50) as comprobante";
        strSQL += " ,mct_cuentacontable.descripcion";
        strSQL += " ,mct_tdoc.nombre as r_doc";
        strSQL += " ,mct_tmediopago.nombre as r_mediopago";
        strSQL += " ,cast(mct_asientocontabledet.r_fecemi as varchar)::varchar(50) as r_fecemi2";
        strSQL += " ,cast(mct_asientocontabledet.r_fecvcto as varchar)::varchar(50) as r_fecvcto2";
        strSQL += " ,cast(mct_asientocontabledet.r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref2";
        strSQL += " from";
        strSQL += " (";
        strSQL += " (";
        strSQL += " mct_asientocontabledet left join mct_cuentacontable";
        strSQL += " on (mct_asientocontabledet.id_cuenta = mct_cuentacontable.id_cuenta and";
        strSQL += "     mct_asientocontabledet.id_usuario = mct_cuentacontable.id_usuario)";
        strSQL += " ) left join mct_tmediopago";
        strSQL += " on (mct_asientocontabledet.r_id_mediopago = mct_tmediopago.id_mediopago)";
        strSQL += " ) left join mct_tdoc";
        strSQL += " on (mct_asientocontabledet.r_id_doc = mct_tdoc.id_doc)";
        strSQL += " where mct_asientocontabledet.id_usuario = $1";
        strSQL += " and mct_asientocontabledet.documento_id = $2";
        strSQL += " and mct_asientocontabledet.periodo = $3";
        strSQL += " and mct_asientocontabledet.id_libro = $4";
        strSQL += " and mct_asientocontabledet.num_asiento = $5";
        strSQL += " and mct_asientocontabledet.item = $6";
        strSQL += " and mct_asientocontabledet.id_cuenta not like '104%'";
        
        strSQL += " union all";
        
        strSQL += " select mct_asientocontabledet.*";
        strSQL += " ,(mct_asientocontabledet.r_cod || '-' || mct_asientocontabledet.r_serie || '-' || mct_asientocontabledet.r_numero)::varchar(50) as comprobante";
        strSQL += " ,mct_cuentacontable_det.descripcion";
        strSQL += " ,mct_tdoc.nombre as r_doc";
        strSQL += " ,mct_tmediopago.nombre as r_mediopago";
        strSQL += " ,cast(mct_asientocontabledet.r_fecemi as varchar)::varchar(50) as r_fecemi2";
        strSQL += " ,cast(mct_asientocontabledet.r_fecvcto as varchar)::varchar(50) as r_fecvcto2";
        strSQL += " ,cast(mct_asientocontabledet.r_fecemi_ref as varchar)::varchar(50) as r_fecemi_ref2";
        strSQL += " from";
        strSQL += " (";
        strSQL += " (";
        strSQL += " mct_asientocontabledet left join mct_cuentacontable_det";
        strSQL += " on (mct_asientocontabledet.id_cuenta = mct_cuentacontable_det.id_cuenta and";
        strSQL += "     mct_asientocontabledet.id_usuario = mct_cuentacontable_det.id_usuario)";
        strSQL += " ) left join mct_tmediopago";
        strSQL += " on (mct_asientocontabledet.r_id_mediopago = mct_tmediopago.id_mediopago)";
        strSQL += " ) left join mct_tdoc";
        strSQL += " on (mct_asientocontabledet.r_id_doc = mct_tdoc.id_doc)";
        strSQL += " where mct_asientocontabledet.id_usuario = $1";
        strSQL += " and mct_asientocontabledet.documento_id = $2";
        strSQL += " and mct_asientocontabledet.periodo = $3";
        strSQL += " and mct_asientocontabledet.id_libro = $4";
        strSQL += " and mct_asientocontabledet.num_asiento = $5";
        strSQL += " and mct_asientocontabledet.item = $6";
        strSQL += " and mct_asientocontabledet.id_cuenta like '104%'";
        
        strSQL += " order by item";
        console.log(strSQL,[id_anfitrion,documento_id,periodo,id_libro,num_asiento,item]);
        
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
        id_anfitrion,     //01
        documento_id,   //02
        periodo,        //03
        id_libro,       //04
        num_asiento,    //05

        fecha_asiento,  //06
        
        id_cuenta,      //07
        glosa,          //08
        r_id_doc,       //09
        r_documento_id, //10
        r_razon_social, //11
        r_fecemi,       //12
        r_fecvcto,      //13
        r_cod,          //14
        r_serie,        //15
        r_numero,       //16
        r_numero2,      //17
        r_fecemi_ref,   //18
        r_cod_ref,      //19
        r_serie_ref,    //20
        r_numero_ref,   //21

        debe_nac,       //22
        haber_nac,      //23
        debe_me,        //24
        haber_me,       //25

        r_tc,           //26
        r_id_mediopago, //27
        r_voucher_banco, //28
        mayorizado,     //29
        asiento_cierre, //30
        r_ccosto        //31
        } = req.body

    //console.log(comprobante_original_fecemi);
    //cuidado con edicion manual de la fecha, se registra al reves, pero en caso de click va normal
    let datePieces = r_fecemi.split("-");
    const fechaArmada = new Date(datePieces[0],datePieces[1],datePieces[2]); //ok con hora 00:00:00
    //console.log(datePieces);
    let sAno = (fechaArmada.getFullYear()).toString(); // new 

    strSQL = "INSERT INTO mct_asientocontabledet";
    strSQL = strSQL + " (";
    strSQL = strSQL + "  id_usuario";       //01
    strSQL = strSQL + " ,documento_id";     //02
    strSQL = strSQL + " ,periodo";          //03
    strSQL = strSQL + " ,id_libro";         //04
    strSQL = strSQL + " ,num_asiento";      //05
    
    strSQL = strSQL + " ,item";             //generado internamente
    
    strSQL = strSQL + " ,fecha_asiento";    //06

    strSQL = strSQL + " ,id_cuenta";        //07
    strSQL = strSQL + " ,glosa";            //08
    strSQL = strSQL + " ,r_id_doc";         //09
    strSQL = strSQL + " ,r_documento_id";    //10
    strSQL = strSQL + " ,r_razon_social";   //11
    strSQL = strSQL + " ,r_fecemi";         //12
    strSQL = strSQL + " ,r_fecvcto";        //13
    strSQL = strSQL + " ,r_cod";            //14
    strSQL = strSQL + " ,r_serie";          //15
    strSQL = strSQL + " ,r_numero";         //16
    strSQL = strSQL + " ,r_numero2";        //17
    strSQL = strSQL + " ,r_fecemi_ref";     //18
    strSQL = strSQL + " ,r_cod_ref";        //19
    strSQL = strSQL + " ,r_serie_ref";      //20
    strSQL = strSQL + " ,r_numero_ref";     //21

    strSQL = strSQL + " ,debe_nac";         //22
    strSQL = strSQL + " ,haber_nac";        //23
    strSQL = strSQL + " ,debe_me";          //24
    strSQL = strSQL + " ,haber_me";         //25

    strSQL = strSQL + " ,r_tc";             //26
    strSQL = strSQL + " ,r_id_mediopago";   //27
    strSQL = strSQL + " ,r_voucher_banco";  //28
    strSQL = strSQL + " ,mayorizado";       //29
    strSQL = strSQL + " ,asiento_cierre";   //30
    strSQL = strSQL + " ,r_ccosto";         //31

    strSQL = strSQL + " )";
    strSQL = strSQL + " VALUES";
    strSQL = strSQL + " (";
    strSQL = strSQL + "  $1";
    strSQL = strSQL + " ,$2";
    strSQL = strSQL + " ,$3";
    strSQL = strSQL + " ,$4";
    strSQL = strSQL + " ,$5";
    strSQL = strSQL + " ,(select * from fct_genera_asiento_item('" + id_anfitrion + "','" + documento_id + "','" + periodo + "','" + id_libro + "','" + num_asiento + "'))"; //item
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
    strSQL = strSQL + " ,$21"; 
    strSQL = strSQL + " ,$22"; 
    strSQL = strSQL + " ,$23"; 
    strSQL = strSQL + " ,$24"; 
    strSQL = strSQL + " ,$25"; 
    strSQL = strSQL + " ,$26"; 
    strSQL = strSQL + " ,$27"; 
    strSQL = strSQL + " ,$28"; 
    strSQL = strSQL + " ,$29"; 
    strSQL = strSQL + " ,$30"; 
    strSQL = strSQL + " ,$31"; 
    strSQL = strSQL + " ) RETURNING *";
    try {
        console.log(strSQL);
        const parametros = [   
            id_anfitrion,     //01
            documento_id,   //02
            periodo,        //03
            id_libro,       //04
            num_asiento,    //05
            
            devuelveCadenaNull(convertirFechaStringComplete(fecha_asiento)),  //06
            
            id_cuenta,      //07
            devuelveCadenaNull(glosa),          //08
            devuelveCadenaNull(r_id_doc),       //09
            devuelveCadenaNull(r_documento_id), //10
            devuelveCadenaNull(r_razon_social), //11
            devuelveCadenaNull(convertirFechaStringComplete(r_fecemi)),       //12
            devuelveCadenaNull(convertirFechaStringComplete(r_fecvcto)),      //13
            devuelveCadenaNull(r_cod),          //14
            devuelveCadenaNull(r_serie),        //15
            devuelveCadenaNull(r_numero),       //16
            devuelveCadenaNull(r_numero2),      //17
            devuelveCadenaNull(convertirFechaStringComplete(r_fecemi_ref)),   //18
            devuelveCadenaNull(r_cod_ref),      //19
            devuelveCadenaNull(r_serie_ref),    //20
            devuelveCadenaNull(r_numero_ref),   //21
    
            devuelveCadenaNull(debe_nac),       //22
            devuelveCadenaNull(haber_nac),      //23
            devuelveCadenaNull(debe_me),        //24
            devuelveCadenaNull(haber_me),       //25
    
            devuelveCadenaNull(r_tc),           //26
            devuelveCadenaNull(r_id_mediopago), //27
            devuelveCadenaNull(r_voucher_banco), //28
            devuelveCadenaNull(mayorizado),     //29
            devuelveCadenaNull(asiento_cierre), //30
            devuelveCadenaNull(r_ccosto)        //31
        ];
        console.log(parametros);
        const result = await pool.query(strSQL,parametros);
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        console.log('error: ',error);
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
                message:"Asiento Detalle no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

const actualizarAsientoDet = async (req,res,next)=> {
    try {
        const {id_anfitrion,documento_id,periodo,id_libro,num_asiento,item} = req.params;
        const { 
            fecha_asiento,  //07
            
            id_cuenta,      //08
            glosa,          //09
            r_id_doc,       //10
            r_documento_id, //11
            r_razon_social, //12
            r_fecemi,       //13
            r_fecvcto,      //14
            r_cod,          //15
            r_serie,        //16
            r_numero,       //17
            r_numero2,      //18
            r_fecemi_ref,   //19
            r_cod_ref,      //20
            r_serie_ref,    //21
            r_numero_ref,   //22
    
            debe_nac,       //23
            haber_nac,      //24
            debe_me,        //25
            haber_me,       //26
    
            r_tc,           //27
            r_id_mediopago, //28
            r_voucher_banco, //29
            r_ccosto        //30
            } = req.body        
 
        var strSQL;
        strSQL = "UPDATE mct_asientocontabledet SET ";
        strSQL = strSQL + "  fecha_asiento = $7"; 

        strSQL = strSQL + " ,id_cuenta = $8";
        strSQL = strSQL + " ,glosa = $9"; 
        strSQL = strSQL + " ,r_id_doc = $10";
        strSQL = strSQL + " ,r_documento_id = $11";
        strSQL = strSQL + " ,r_razon_social = $12";
        strSQL = strSQL + " ,r_fecemi = $13";         
        strSQL = strSQL + " ,r_fecvcto = $14";
        strSQL = strSQL + " ,r_cod = $15";
        strSQL = strSQL + " ,r_serie = $16";
        strSQL = strSQL + " ,r_numero = $17";
        strSQL = strSQL + " ,r_numero2 = $18";
        strSQL = strSQL + " ,r_fecemi_ref = $19";
        strSQL = strSQL + " ,r_cod_ref = $20";
        strSQL = strSQL + " ,r_serie_ref = $21";
        strSQL = strSQL + " ,r_numero_ref = $22";
    
        strSQL = strSQL + " ,debe_nac = $23";
        strSQL = strSQL + " ,haber_nac = $24";
        strSQL = strSQL + " ,debe_me = $25"; 
        strSQL = strSQL + " ,haber_me = $26";
    
        strSQL = strSQL + " ,r_tc = $27";           
        strSQL = strSQL + " ,r_id_mediopago = $28"; 
        strSQL = strSQL + " ,r_voucher_banco = $29";
        strSQL = strSQL + " ,r_ccosto = $30";

        strSQL = strSQL + " WHERE id_usuario = $1";
        strSQL = strSQL + " AND documento_id = $2";
        strSQL = strSQL + " AND periodo = $3";
        strSQL = strSQL + " AND id_libro = $4";
        strSQL = strSQL + " AND num_asiento = $5";
        strSQL = strSQL + " AND item = $6";
        //console.log(strSQL);
        const parametros = [   
            id_anfitrion,   //01
            documento_id,   //02
            periodo,        //03
            id_libro,       //04
            num_asiento,    //05
            item,           //06

            devuelveCadenaNull(convertirFechaStringComplete(fecha_asiento)),  //07
            
            id_cuenta,      //08
            glosa,          //09
            r_id_doc,       //10
            r_documento_id, //11
            r_razon_social, //12
            devuelveCadenaNull(convertirFechaStringComplete(r_fecemi)),       //13
            devuelveCadenaNull(convertirFechaStringComplete(r_fecvcto)),      //14
            r_cod,          //15
            r_serie,        //16
            r_numero,       //17
            r_numero2,      //18
            devuelveCadenaNull(convertirFechaStringComplete(r_fecemi_ref)),   //19
            r_cod_ref,      //20
            r_serie_ref,    //21
            r_numero_ref,   //22
    
            debe_nac,       //23
            haber_nac,      //24
            debe_me,        //25
            haber_me,       //26
    
            r_tc,           //27
            r_id_mediopago, //28
            r_voucher_banco, //29
            r_ccosto        //30
        ];
        //console.log(parametros);
        const result = await pool.query(strSQL,parametros);

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