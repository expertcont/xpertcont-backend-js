const pool = require('../db');

const obtenerTodosContabilidadesVista = async (req,res,next)=> {
    try {
        const {id_usuario,id_invitado} = req.params;
        let strSQL;
        //Aqui modificar para cvista de contabilidades asiganadas y por asignar
        strSQL = "SELECT mad_usuariocontabilidad.documento_id";
        strSQL = strSQL + " ,(mad_usuariocontabilidad.documento_id || ' ' || mad_usuariocontabilidad.razon_social)::varchar(200) as nombre2";
        strSQL = strSQL + " ,mad_usuariocontabilidad.razon_social as nombre";
        strSQL = strSQL + " ,mad_seguridad_comando.documento_id as id_permiso";
        strSQL = strSQL + " FROM"; 
        strSQL = strSQL + " mad_usuariocontabilidad LEFT JOIN mad_seguridad_contabilidad";
        strSQL = strSQL + " ON (mad_usuariocontabilidad.documento_id = mad_seguridad_contabilidad.documento_id and";
        strSQL = strSQL + "     mad_seguridad_contabilidad.id_usuario like '" + id_usuario + "%' and";
        strSQL = strSQL + "     mad_seguridad_contabilidad.id_invitado like '" + id_invitado + "%' )";
        strSQL = strSQL + " ORDER BY mad_usuariocontabilidad.razon_social";
        console.log(strSQL);
        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }

    //res.send('Listado de todas los zonas');
};

const obtenerTodosUsuarios = async (req,res,next)=> {
    //console.log("select nombre,email,dni,telefono,vendedor,supervisor,activo from mad_usuario order by nombre");
    try {
        const todosReg = await pool.query("select id_usuario,nombre,email,dni,telefono,vendedor,supervisor,activo from mad_usuario order by nombre");
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosEstudios = async (req,res,next)=> {
    //console.log("select nombre,email,dni,telefono,vendedor,supervisor,activo from mad_usuario order by nombre");
    try {
        const {id_usuario} = req.params;
        var strSQL;
        strSQL = "SELECT id_usuario, nombres from mad_usuario";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        strSQL = strSQL + " AND anfitrion = '1'";

        strSQL = strSQL + " UNION ALL";
        
        strSQL = strSQL + " SELECT consulta.*,";
        strSQL = strSQL + " mad_usuario.nombres";
        strSQL = strSQL + " FROM (";
        strSQL = strSQL + " select";
        strSQL = strSQL + " mad_usuariogrupo.id_usuario";
        strSQL = strSQL + " from mad_usuariogrupo inner join mad_usuario";
        strSQL = strSQL + " on (mad_usuariogrupo.id_invitado = mad_usuario.id_usuario)";
        strSQL = strSQL + " where mad_usuariogrupo.id_invitado = '" + id_usuario + "'";
        strSQL = strSQL + " ) as consulta";
        strSQL = strSQL + " INNER JOIN mad_usuario";
        strSQL = strSQL + " ON (consulta.id_usuario = mad_usuario.id_usuario)";

        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};
const obtenerTodosPeriodos = async (req,res,next)=> {
    try {
        const {id_usuario} = req.params;
        var strSQL;
        //Seleccionamos el ultimo
        strSQL = "SELECT periodo from mad_usuariolicencia";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'";
        strSQL = strSQL + " GROUP BY periodo";
        strSQL = strSQL + " ORDER BY periodo DESC"; 

        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerAnfitrion = async (req,res,next)=> {
    //Todas las contabilidades autorizadas por el anfitrion y permisos al auxiliar contable
    //el anfitrion esta autorizado a todos sin permiso
    //luego el invitado con permisos nomas
    try {
        const {id_usuario} = req.params;
        var strSQL;
        strSQL = "SELECT documento_id, razon_social from mad_usuariocontabilidad";
        strSQL = strSQL + " WHERE id_usuario = '" + id_usuario + "'"; //el anfitrion y
        strSQL = strSQL + " AND id_usuario = '" + id_invitado + "'"; //el auxiliar coinciden (acceso 100%)
        strSQL = strSQL + " AND activo = '1'";

        strSQL = strSQL + " UNION ALL";
        
        strSQL = strSQL + " SELECT mad_seguridad_contabilidad.documento_id,";
        strSQL = strSQL + " mad_usuariocontabilidad.razon_social";
        strSQL = strSQL + " FROM ";
        strSQL = strSQL + " mad_seguridad_contabilidad INNER JOIN mad_usuariocontabilidad";
        strSQL = strSQL + " ON (mad_seguridad_contabilidad.documento_id = mad_usuariocontabilidad.documento_id and ";
        strSQL = strSQL + "'" + id_usuario + "'= mad_usuariocontabilidad.id_usuario )";
        strSQL = strSQL + " WHERE mad_seguridad_contabilidad.id_usuario = '" + id_usuario + "'"; //anfitrion
        strSQL = strSQL + " AND mad_seguridad_contabilidad.id_invitado = '" + id_invitado + "'"; //auxiliar

        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerTodosContabilidades = async (req,res,next)=> {
    //Todas las contabilidades autorizadas por el anfitrion y permisos al auxiliar contable
    try {
        const {id_usuario,id_invitado} = req.params;
        var strSQL;
        //Si es el anfitrion esta autorizado a todos sin permiso
        strSQL = "select * from (";
        strSQL += "SELECT documento_id, razon_social from mad_usuariocontabilidad";
        strSQL += " WHERE id_usuario = '" + id_usuario + "'"; //el anfitrion y
        strSQL += " AND id_usuario = '" + id_invitado + "'"; //el auxiliar coinciden (acceso 100%)
        strSQL += " AND activo = '1'";

        strSQL += " UNION ALL";
        
        //Si es el invitado con permisos nomas
        strSQL += " SELECT mad_seguridad_contabilidad.documento_id,";
        strSQL += " mad_usuariocontabilidad.razon_social";
        strSQL += " FROM ";
        strSQL += " mad_seguridad_contabilidad INNER JOIN mad_usuariocontabilidad";
        strSQL += " ON (mad_seguridad_contabilidad.documento_id = mad_usuariocontabilidad.documento_id and ";
        strSQL += "'" + id_usuario + "'= mad_usuariocontabilidad.id_usuario )";
        strSQL += " WHERE mad_seguridad_contabilidad.id_usuario = '" + id_usuario + "'"; //anfitrion
        strSQL += " AND mad_seguridad_contabilidad.id_invitado = '" + id_invitado + "'"; //auxiliar
        strSQL += " ) as consulta";
        strSQL += " order by razon_social";

        const todosReg = await pool.query(strSQL);
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }
};

const obtenerUsuario = async (req,res,next)=> {
    try {
        const {id} = req.params;
        const result = await pool.query("select * from mad_usuario where id_usuario = $1",[id]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Usuario no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};

const crearUsuario = async (req,res,next)=> {
    const {id_usuario,nombre,email,dni,telefono,vendedor,supervisor,activo,anfitrion} = req.body
    try {
        var strSQL;
        strSQL = "INSERT INTO mad_usuario ";
        strSQL = strSQL + " (id_usuario,nombre,email,dni,telefono,ctrl_insercion) RETURNING *";
        strSQL = strSQL + " VALUES ($1,$2,$3,$4,$5,current_timestamp) RETURNING *";
        const result = await pool.query(strSQL, 
        [   
            id_usuario,
            nombre,
            email,
            dni,
            telefono,
            vendedor,
            activo,
            anfitrion
        ]
        );
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const eliminarUsuario = async (req,res,next)=> {
    try {
        const {id} = req.params;
        const result = await pool.query("delete from mad_usuario where id_usuario = $1",[id]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Usuario no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};
const actualizarUsuario = async (req,res,next)=> {
    try {
        var strSQL;
        const {id} = req.params;
        const {nombre,email,dni,telefono,vendedor,supervisor,activo,anfitrion} = req.body
        strSQL = "update mad_usuario set";
        strSQL = strSQL + "  nombre=$1";
        strSQL = strSQL + " ,email=$2";
        strSQL = strSQL + " ,dni=$3";
        strSQL = strSQL + " ,telefono=$4";
        strSQL = strSQL + " ,vendedor=$5";
        strSQL = strSQL + " ,supervisor=$6";
        strSQL = strSQL + " ,activo=$7";
        strSQL = strSQL + " ,anfitrion=$8";
        strSQL = strSQL + " where id_usuario=$9";
        
        const result = await pool.query(strSQL,
        [   
            nombre,
            email,
            dni,
            telefono,
            vendedor,
            supervisor,
            activo,
            anfitrion
        ]
        );

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
    obtenerTodosContabilidadesVista,
    obtenerTodosUsuarios,
    obtenerTodosEstudios,
    obtenerTodosPeriodos,
    obtenerAnfitrion,
    obtenerTodosContabilidades,
    obtenerUsuario,
    crearUsuario,
    eliminarUsuario,
    actualizarUsuario
 }; 