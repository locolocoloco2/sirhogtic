function normalizarCedula(cedula){
  const d = String(cedula || '').replace(/\D/g,'');
  if (!d) return '';
  if (d.length >= 9 && d.length <= 11) return d.padStart(11,'0');
  return d;
}
function formatearCedula(cedula){
  const c = normalizarCedula(cedula);
  return c.length === 11 ? `${c.slice(0,3)}-${c.slice(3,10)}-${c.slice(10)}` : String(cedula||'');
}
function parseFecha(v){
  if (!v) return null;
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number' && window.XLSX) {
    const p = XLSX.SSF.parse_date_code(v);
    if (p) return new Date(p.y, p.m-1, p.d);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) { const [d,m,y]=s.split('/').map(Number); return new Date(y,m-1,d); }
  const x = new Date(s); return isNaN(x) ? null : new Date(x.getFullYear(),x.getMonth(),x.getDate());
}
function isoFecha(v){ const d=parseFecha(v); return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : ''; }
function mostrarFecha(v){ const d=parseFecha(v); return d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : ''; }
function hoyISO(){ return isoFecha(new Date()); }
function money(n){ return Number(n||0).toLocaleString('es-DO',{style:'currency',currency:'DOP'}); }
function normalizarGenero(v){ const s=String(v||'').trim().toUpperCase(); if(['M','MASCULINO','HOMBRE'].includes(s))return'M'; if(['F','FEMENINO','MUJER'].includes(s))return'F'; return s; }
function generoTexto(g){ return normalizarGenero(g)==='F'?'Femenino': normalizarGenero(g)==='M'?'Masculino':''; }
function toast(msg,type='ok'){ const el=document.getElementById('toast'); el.textContent=msg; el.style.background=type==='error'?'#7f1d1d':'#081a30'; el.classList.add('show'); clearTimeout(window.__t); window.__t=setTimeout(()=>el.classList.remove('show'),4200); }
function addDays(d,days){ const x=new Date(d); x.setDate(x.getDate()+days); return x; }
function daysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
function aniversario(fechaISO, year){ const f=parseFecha(fechaISO); return new Date(year,f.getMonth(),Math.min(f.getDate(),daysInMonth(year,f.getMonth()))); }
function aniosCumplidos(fechaISO, refISO){ const f=parseFecha(fechaISO), r=parseFecha(refISO); if(!f||!r)return 0; let y=r.getFullYear()-f.getFullYear(); if(r<aniversario(fechaISO,r.getFullYear())) y--; return Math.max(y,0); }
function numeroALetras(n){
  n=Math.floor(Number(n||0)); const u=['','Uno','Dos','Tres','Cuatro','Cinco','Seis','Siete','Ocho','Nueve'];
  const e=['Diez','Once','Doce','Trece','Catorce','Quince','Dieciséis','Diecisiete','Dieciocho','Diecinueve'];
  const d=['','','Veinte','Treinta','Cuarenta','Cincuenta','Sesenta','Setenta','Ochenta','Noventa'];
  const c=['','Ciento','Doscientos','Trescientos','Cuatrocientos','Quinientos','Seiscientos','Setecientos','Ochocientos','Novecientos'];
  function mil(x){ if(x===0)return''; if(x===100)return'Cien'; let C=Math.floor(x/100),R=x%100,out=[]; if(C)out.push(c[C]); if(R<10)out.push(u[R]); else if(R<20)out.push(e[R-10]); else if(R===20)out.push('Veinte'); else if(R<30)out.push('Veinti'+u[R-20].toLowerCase()); else {let D=Math.floor(R/10),U=R%10; out.push(d[D]+(U?' y '+u[U]:''));} return out.filter(Boolean).join(' ');}
  if(n===0)return'Cero'; if(n<1000)return mil(n); if(n<1000000){let M=Math.floor(n/1000),R=n%1000; return (M===1?'Mil':mil(M)+' Mil')+(R?' '+mil(R):'');}
  return String(n);
}
function salarioLetras(n){ const ent=Math.floor(Number(n||0)); const cen=Math.round((Number(n||0)-ent)*100); return `${numeroALetras(ent)} con ${String(cen).padStart(2,'0')}/100`; }
