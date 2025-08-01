const pool = require('../db');

const obtenerTodasFormasPago = async (req,res,next)=> {
    try {
        const todosRegistros = await pool.query("select id_mediopago, nombre from mct_tmediopago order by id_mediopago");
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }

    //res.send('Listado de todas los zonas');
};
const obtenerTodasFormasPagoAdmin = async (req,res,next)=> {
    try {
        //Excepcion del contado clasico 
        const todosRegistros = await pool.query("select id_forma_pago, nombre from mve_forma_pago order by id_forma_pago where deposito = '1'");
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }

    //res.send('Listado de todas los zonas');
};

const obtenerTodasFormasPagoPopUp = async (req,res,next)=> {
    try {
        const todosRegistros = await pool.query("select id_mediopago as codigo, nombre as descripcion, '' as auxiliar from mct_tmediopago order by id_mediopago");
        res.json(todosRegistros.rows);
    }
    catch(error){
        console.log(error.message);
    }

    //res.send('Listado de todas los zonas');
};

const obtenerFormaPago = async (req,res,next)=> {
    try {
        const {id} = req.params;
        const result = await pool.query("select * from mct_tmediopago where id_mediopago = $1",[id]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Usuario no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearFormaPago = async (req,res,next)=> {
    //const {id_usuario,nombres} = req.body
    const {nombre,descripcion,siglas} = req.body
    try {
        const result = await pool.query("INSERT INTO mve_zona(nombre,descripcion,siglas) VALUES ($1,$2,$3) RETURNING *", 
        [   
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

const eliminarFormaPago = async (req,res,next)=> {
    try {
        const {id} = req.params;
        const result = await pool.query("delete from mct_tmediopago where id_mediopago = $1",[id]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Zona no encontrada"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};
const actualizarFormaPago = async (req,res,next)=> {
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
    obtenerTodasFormasPago,
    obtenerTodasFormasPagoAdmin,
    obtenerTodasFormasPagoPopUp,
    obtenerFormaPago,
    crearFormaPago,
    eliminarFormaPago,
    actualizarFormaPago
 }; 