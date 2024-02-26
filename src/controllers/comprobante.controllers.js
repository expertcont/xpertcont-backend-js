const pool = require('../db');

const obtenerTodosComprobante = async (req,res,next)=> {
    //console.log("select documento_id, razon_social, telefono from mad_Comprobante order by razon_social");
    try {
        const todosReg = await pool.query("select * from mct_tcomprobante order by cod");
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }

    //res.send('Listado de todas los zonas');
};
const obtenerComprobante = async (req,res,next)=> {
    try {
        const {cod} = req.params;
        const result = await pool.query("SELECT * FROM mct_tcomprobante WHERE cod = $1",[cod]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Comprobante no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};
const obtenerComprobantePopUp = async (req,res,next)=> {
    try {
        let strSQL;
        strSQL = "SELECT cod as codigo, nombre as descripcion, '' as auxiliar";
        strSQL += " FROM mct_tcomprobante";
        strSQL += " ORDER BY codigo";

        const result = await pool.query(strSQL);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Comprobante no encontrado"
            });

        res.json(result.rows);
    } catch (error) {
        console.log(error.message);
    }
};

const crearComprobante = async (req,res,next)=> {
    //const {id_usuario,nombres} = req.body
    const {
        cod,        //01
        nombre,     //02    
        descripcion,   //03    
        nombre_corto,  //04
        c_ventas,      //05
        c_compras,    //06
    } = req.body

    try {
        const result = await pool.query("INSERT INTO mct_tcomprobante VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", 
        [   
            cod,        //01
            nombre,     //02    
            descripcion,   //03    
            nombre_corto,  //04
            c_ventas,      //05
            c_compras,    //06
        ]
        );
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const eliminarComprobante = async (req,res,next)=> {
    try {
        const {cod} = req.params;
        const result = await pool.query("delete from mct_tcomprobante where cod = $1",[cod]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Comprobante no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};
const actualizarComprobante = async (req,res,next)=> {
    let strSQL;
    try {
        const {cod} = req.params;
        const { 
                nombre,         //01
                descripcion,    //02
                nombre_corto,   //03
                c_compras,      //04
                c_ventas,       //05
            } = req.body

        strSQL = " UPDATE mct_comprobante SET";
        strSQL += "  nombre=$1";
        strSQL += " ,descripcion=$2";
        strSQL += " ,nombre_corto=$3";
        strSQL += " ,c_compras=$4";
        strSQL += " ,c_ventas=$5";
        strSQL += "  WHERE cod=$6";
        const result = await pool.query(strSQL,
        [   
            nombre,         //01
            descripcion,    //02
            nombre_corto,   //03
            c_compras,      //04
            c_ventas,       //05
            cod             //06 parametro entrada
        ]
        );

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Comprobante no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

module.exports = {
    obtenerTodosComprobante,
    obtenerComprobante,
    obtenerComprobantePopUp,
    crearComprobante,
    eliminarComprobante,
    actualizarComprobante
 }; 