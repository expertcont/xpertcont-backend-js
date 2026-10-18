const fallo = message => Object.assign(new Error(message), {statusCode:422});
function decimal(valor, escala=2) {
 const s=String(valor ?? '').trim() || '0';
 const limpio=s.includes(',') && /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g,'') : s;
 const m=limpio.match(/^(-?)(\d+)(?:\.(\d+))?$/);
 if(!m || (m[3] || '').slice(escala).replace(/0/g,'') || m[2].replace(/^0+/,'').length>(escala===6?8:16))throw fallo('Importe invalido o fuera de precision: '+s);
 const entero=m[2].replace(/^0+(?=\d)/,'');
 const fraccion=(m[3] || '').slice(0,escala).padEnd(escala,'0');
 const signo=m[1] && (BigInt(entero)!==0n || /[1-9]/.test(fraccion)) ? '-' : '';
 return signo+entero+(escala?'.'+fraccion:'');
}
const centimos=v=>BigInt(decimal(v).replace('.',''));
const desdeCentimos=v=>{const neg=v<0n;const s=(neg?-v:v).toString().padStart(3,'0');return (neg?'-':'')+s.slice(0,-2)+'.'+s.slice(-2);};
module.exports={decimal,centimos,desdeCentimos};
