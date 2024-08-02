const pool = require('../db');

const obtenerTodosCorrentista = async (req,res,next)=> {
    //console.log("select documento_id, razon_social, telefono from mad_correntista order by razon_social");
    try {
        const todosReg = await pool.query("select * from mad_correntista order by id_documento, razon_social");
        res.json(todosReg.rows);
    }
    catch(error){
        console.log(error.message);
    }

    //res.send('Listado de todas los zonas');
};
const obtenerCorrentista = async (req,res,next)=> {
    try {
        const {id_usuario, id} = req.params;
        
        console.log(id_usuario,id);
        const result = await pool.query("SELECT * FROM mad_correntista WHERE id_usuario = $1 AND documento_id = $2",[id_usuario,id]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Correntista no encontrado"
            });

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
};
const obtenerCorrentistaPopUp = async (req,res,next)=> {
    try {
        const {id_usuario, documento_id} = req.params;
        let strSQL;
        strSQL = "select * from fct_correntistas($1,$2)";
        strSQL += " as (";
        strSQL += "     codigo VARCHAR(20),";
        strSQL += "     descripcion varchar(200),";
        strSQL += "     auxiliar varchar(2)";
        strSQL += " )";

        /*strSQL = "SELECT r_documento_id as codigo, r_razon_social as descripcion, r_id_doc as auxiliar";
        strSQL += " FROM mct_asientocontabledet";
        strSQL += " WHERE id_usuario = $1 AND documento_id = $2 AND NOT r_documento_id IS NULL";
        strSQL += " GROUP BY r_id_doc,r_documento_id,r_razon_social";
        strSQL += " ORDER BY r_razon_social";*/

        const result = await pool.query(strSQL,[id_usuario,documento_id]);

        if (result.rows.length === 0)
            return res.status(404).json({
                message:"Correntista no encontrado"
            });

        res.json(result.rows);
    } catch (error) {
        console.log(error.message);
    }
};

const generarCorrentistaFetchFromAPI = async (documento_id, apiToken) => {
    //tipo = 'ruc' o 'dni'
    //ruc = 'XXXXXXXX' 11 digitos o variable
    let tipo;
    if (documento_id.length===11) {tipo = 'ruc';} else {tipo='dni';}

    const response = await fetch(`https://apiperu.dev/api/${tipo}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiToken}`
        },
        body: JSON.stringify({ documento_id })
    });
    return response.json();
};
const generarCorrentistaFromDB = async (documento_id) => {
    const strSQL = `
        SELECT * FROM mad_correntista
        WHERE documento_id = $1
    `;
    const { rows } = await pool.query(strSQL, [documento_id]);
    return rows;
};
const generarCorrentistaInsertDB = async (documento_id, razon_social, id_doc) => {
    try {
        const insertQuery = `
            INSERT INTO mad_correntista (documento_id, razon_social, id_doc)
            VALUES ($1, $2, $3) RETURNING *
        `;
        const values = [documento_id, razon_social, id_doc];
        const insertResult = await pool.query(insertQuery, values);
        console.log('Dato insertado:', insertResult.rows[0]);
    } catch (dbError) {
        if (dbError.code === '23505') { // Código de error para duplicados en PostgreSQL
            console.log('El dato ya existe en la base de datos, finalizamos simplemente');
        } else {
            throw dbError;
        }
    }
};

const generarCorrentista = async (req, res, next) => {
    const apiToken = process.env.APIPERU_TOKEN;
    const { ruc } = req.body;
    
    let id_doc = (ruc.length === 11) ? '6' : '1';

    try {
        const rows = await generarCorrentistaFromDB(ruc);

        if (rows.length > 0) {
            const resultado = {
                nombre_o_razon_social: parseFloat(rows[0].razon_social),
                r_id_doc: parseFloat(rows[0].id_doc)
            };
            return res.json(resultado); // Aquí se detiene la ejecución si se cumple esta condición
        } 

        const resultado = await generarCorrentistaFetchFromAPI(ruc, apiToken);

        if (resultado.success) {
            //la respuesta del api, puede ser ruc o dni
            const { nombre_o_razon_social } = resultado.data;
            await generarCorrentistaInsertDB(ruc, nombre_o_razon_social, id_doc);
            
            //conforme a condicion se retorna valores
            const resultadoReducido = {
                nombre_o_razon_social: nombre_o_razon_social,
                r_id_doc: id_doc
            };
            return res.json(resultadoReducido); // Aquí se detiene la ejecución si se cumple esta condición
        }

        return res.json({ nombre_o_razon_social: '', r_id_doc: ''}); // Aquí se detiene la ejecución si `resultado.success` es falso
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message }); // Aquí se detiene la ejecución si ocurre un error
    }
};

const crearCorrentista = async (req,res,next)=> {
    //const {id_usuario,nombres} = req.body
    const {
        documento_id,   //01
        id_documento,   //02    
        razon_social,   //03    
        codigo,         //04
        contacto,       //05
        telefono,       //06
        telefono2,      //07
        email,          //08
        email2,         //09
        id_vendedor,    //10
        id_zonadet      //11
    } = req.body

    try {
        const result = await pool.query("INSERT INTO mad_correntista VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *", 
        [   
        documento_id,   //01
        id_documento,   //02    
        razon_social,   //03    
        codigo,         //04
        contacto,       //05
        telefono,       //06
        telefono2,      //07
        email,          //08
        email2,         //09
        id_vendedor,    //10
        id_zonadet      //11
        ]
        );
        res.json(result.rows[0]);
    }catch(error){
        //res.json({error:error.message});
        next(error)
    }
};

const eliminarCorrentista = async (req,res,next)=> {
    try {
        const {id} = req.params;
        const result = await pool.query("delete from mad_correntista where documento_id = $1",[id]);

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Correntista no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }

};
const actualizarCorrentista = async (req,res,next)=> {
    let strSQL;
    try {
        const {id} = req.params;
        const { razon_social,   //01
                codigo,         //02
                contacto,       //03
                telefono,       //04
                telefono2,      //05
                email,          //06
                email2,         //07
                id_vendedor,    //08
                id_zonadet,     //09
                //relacionado,    //10
                //base            //11
            } = req.body

        strSQL = " UPDATE mad_correntista SET";
        strSQL = strSQL + "  razon_social=$1";
        strSQL = strSQL + " ,codigo=$2";
        strSQL = strSQL + " ,contacto=$3";
        strSQL = strSQL + " ,telefono=$4";
        strSQL = strSQL + " ,telefono2=$5";
        strSQL = strSQL + " ,email=$6";
        strSQL = strSQL + " ,email2=$7";
        strSQL = strSQL + " ,id_vendedor=$8";
        strSQL = strSQL + " ,id_zonadet=$9";
        //strSQL = strSQL + " ,relacionado=$10";
        //strSQL = strSQL + " ,base=$11";
        strSQL = strSQL + "  WHERE documento_id=$10";
        const result = await pool.query(strSQL,
        [   
            razon_social,   //01
            codigo,         //02
            contacto,       //03
            telefono,       //04
            telefono2,      //05
            email,          //06
            email2,         //07
            id_vendedor,    //08
            id_zonadet,     //09
            //relacionado,    //10
            //base,           //11
            id              //10
        ]
        );

        if (result.rowCount === 0)
            return res.status(404).json({
                message:"Correntista no encontrado"
            });

        return res.sendStatus(204);
    } catch (error) {
        console.log(error.message);
    }
};

module.exports = {
    obtenerTodosCorrentista,
    obtenerCorrentista,
    obtenerCorrentistaPopUp,
    crearCorrentista,
    eliminarCorrentista,
    actualizarCorrentista,
    generarCorrentista //new para consutla de api y insert bd interna expercont
 }; 