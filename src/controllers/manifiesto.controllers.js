const pool = require('../db');

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
const obtenerZona = async (req,res,next)=> {
    try {
        const {id} = req.params;
        const result = await pool.query("select * from mve_zona where id_zona = $1",[id]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Usuario no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearZona = async (req,res,next)=> {
    const {id_zona,nombre,descripcion,siglas} = req.body
    try {
        const result = await pool.query("INSERT INTO mve_zona(id_zona,nombre,descripcion,siglas) VALUES ($1,$2,$3,$4) RETURNING *", 
        [   
            id_zona,
            nombre,
            descripcion,
            siglas
        ]
        );
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
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

module.exports = {
    obtenerTodosManifiestoDet,
    obtenerZona,
    crearZona,
    eliminarZona,
    actualizarZona
 }; 