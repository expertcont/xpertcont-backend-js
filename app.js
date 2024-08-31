const express = require('express');
const res = require('express/lib/response');
const morgan = require('morgan');
const cors = require('cors');

//microservicio admin
const ventaRoutes = require('./src/routes/venta.routes');

const reporteRoutes = require('./src/routes/reporte.routes');
const comprobanteRoutes = require('./src/routes/comprobante.routes');
const asientodetRoutes = require('./src/routes/asientodet.routes');
const asientoRoutes = require('./src/routes/asiento.routes');
const productoRoutes = require('./src/routes/producto.routes');
const usuarioRoutes = require('./src/routes/usuario.routes');
const correntistaRoutes = require('./src/routes/correntista.routes');
const zonaRoutes = require('./src/routes/zona.routes');
const zonadetRoutes = require('./src/routes/zonadet.routes');
const formapagoRoutes = require('./src/routes/formapago.routes');
const seguridadRoutes = require('./src/routes/seguridad.routes');
const contabilidadRoutes = require('./src/routes/contabilidad.routes');
const cuentaRoutes = require('./src/routes/cuenta.routes');
const tsunatRoutes = require('./src/routes/tsunat.routes');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors()); //comunica con otro backend

app.use(morgan('dev'));
app.use(express.json()); //para reconocer json en express, parametros POST
app.use(express.text()); //new para text ;)

app.use(ventaRoutes);

app.use(reporteRoutes);
app.use(comprobanteRoutes);
app.use(asientodetRoutes);
app.use(asientoRoutes);
app.use(productoRoutes);
app.use(usuarioRoutes);
app.use(correntistaRoutes);
app.use(zonaRoutes);
app.use(zonadetRoutes);
app.use(formapagoRoutes);
app.use(seguridadRoutes);
app.use(contabilidadRoutes);
app.use(cuentaRoutes);
app.use(tsunatRoutes);

app.use((err, req, res, next) => {
    return res.json({
        message: err.message
    })
})

app.listen(port);
console.log("Servidor puerto ", port);