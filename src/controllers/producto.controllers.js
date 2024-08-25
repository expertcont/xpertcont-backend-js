const pool = require('../db');

const obtenerTodosProductos = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_usuario,documento_id} = req.params;
        strSQL = "SELECT * FROM mst_producto "
        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " ORDER BY nombre";

        const todosRegistros = await pool.query(strSQL,[id_usuario,documento_id]);
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }

    //res.send('Listado de todas los zonas');
};
const obtenerProducto = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_usuario,documento_id,id_producto} = req.params;

        strSQL = "select * from mst_producto "
        strSQL += " where id_usuario = $1";
        strSQL += " and documento_id = $2";
        strSQL += " and id_producto = $3";

        const result = await pool.query(strSQL,[id_usuario,documento_id,id_producto]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Producto no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};
const obtenerProductoIgv = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_usuario,documento_id,id_producto} = req.params;
        strSQL = "select porc_igv from mst_producto "
        strSQL += " where id_usuario = $1";
        strSQL += " and documento_id = $2";
        strSQL += " and id_producto = $3";

        const result = await pool.query(strSQL,[id_usuario,documento_id,id_producto]);

        if (result.rows.length === 0){
            res.json({porc_igv:"0.00"});
        };

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearProducto = async (req,res,next)=> {
    const { 
            id_usuario,     //01
            documento_id,   //02
            id_producto,    //03    
            nombre,         //04
            descripcion,    //05
            precio_venta,   //06
            cont_und        //07
        } = req.body
    let strSQL;
    try {
        strSQL = "INSERT INTO mst_producto(";
        strSQL += " id_usuario";    //01
        strSQL += ",documento_id";  //02
        strSQL += ",id_producto";   //03
        strSQL += ",nombre";        //04
        strSQL += ",descripcion";   //05
        strSQL += ",precio_venta";  //06
        strSQL += ",cont_und";      //07
        strSQL += ") VALUES ( ";

        strSQL += " $1,$2,$3,$4,$5,$6,$7 ";
        strSQL += " ) RETURNING *";

        const result = await pool.query(strSQL, 
        [   
            id_usuario,     //01
            documento_id,   //02
            id_producto,    //03    
            nombre,         //04
            descripcion,    //05
            precio_venta,   //06
            cont_und        //07
        ]
        );
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const eliminarProducto = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_usuario,documento_id,id_producto} = req.params;
        strSQL = "delete from mst_producto "
        strSQL += " where id_usuario = $1";
        strSQL += " and documento_id = $2";
        strSQL += " and id_producto = $3";

        const result = await pool.query(strSQL,[id_usuario,documento_id,id_producto]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Producto no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};
const actualizarProducto = async (req,res,next)=> {
    try {
        let strSQL;
        const {id_usuario,documento_id,id_producto} = req.params; //03
        const { nombre,         //04
                descripcion,    //05
                precio_venta,   //06
                porc_igv,       //07
                cont_und        //08
        } = req.body    
        strSQL = "UPDATE from mst_producto SET"
        strSQL += "  nombre = $4";
        strSQL += " ,descripcion = $5";
        strSQL += " ,precio_venta = $6";
        strSQL += " ,porc_igv = $7";                
        strSQL += " ,cont_und= $8";
        
        strSQL += " WHERE id_usuario = $1";
        strSQL += " AND documento_id = $2";
        strSQL += " AND id_producto = $3";

        const result = await pool.query(strSQL,[id_usuario,documento_id,id_producto]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Producto no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

module.exports = {
    obtenerTodosProductos,
    obtenerProducto,
    obtenerProductoIgv,
    crearProducto,
    eliminarProducto,
    actualizarProducto
 }; 