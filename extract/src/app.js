const FECHA_CORTE_INACTIVOS_VACACIONES = '2026-06-25';
let state = { profile:null, data:{empleados:[],feriados:[],solicitudes:[],certificaciones:[],liquidaciones:[],tickets:[]}, workbook:null };

document.getElementById('todayText').textContent = new Date().toLocaleDateString('es-DO',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
document.getElementById('fechaReferencia').value = hoyISO();
document.getElementById('certFecha').value = hoyISO();

function isAdmin(){ return state.profile?.role === 'admin'; }
function applyRoleUI(){
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin()));
  document.getElementById('userRoleText').textContent = `${state.profile?.email || ''} · ${state.profile?.role || ''}`;
}
async function loadData(){
  try {
    state.data = await Api.all();
    renderAll();
  } catch (err) {
    console.error(err);
    toast(err.message || 'No se pudieron cargar los datos.', 'error');
  }
}
function renderAll(){ applyRoleUI(); renderDashboard(); renderEmpleados(); renderFeriados(); renderSolicitudes(); renderInactivos(); renderTickets(); renderDatalist(); }

function estatusHistorico(e){
  return String(e.estatus_nomina || e.estatus || e.estado || '').trim().toLowerCase();
}

function esActivoHistorico(e){
  const s = estatusHistorico(e);
  return s === 'activo' || (s.includes('activo') && !s.includes('des'));
}

function esDesvinculadoHistorico(e){
  const s = estatusHistorico(e);
  return s.includes('desvinculado') || s.includes('inactivo') || s.includes('des');
}

function renderDashboard(){
  const e = state.data.empleados;

  // Esta nómina es histórica: el dashboard debe contar por estatus de nómina,
  // no por el campo interno estado usado para vacaciones futuras.
  document.getElementById('kpiActivos').textContent = e.filter(esActivoHistorico).length;
  document.getElementById('kpiInactivos').textContent = e.filter(esDesvinculadoHistorico).length;

  document.getElementById('kpiPendientes').textContent=state.data.solicitudes.filter(x=>x.estado==='pendiente').length;
  document.getElementById('kpiTickets').textContent=state.data.tickets.filter(x=>x.estado==='abierto').length;
}
function renderDatalist(){
  setupEmployeeSearch('buscarCedula');
  setupEmployeeSearch('solCedula');
  setupEmployeeSearch('certCedula');
}

function empleadoSearchText(e){
  return `${e.cedula || ''} ${formatearCedula(e.cedula || '')} ${e.nombre || ''} ${e.cargo || ''} ${e.departamento || ''}`.toLowerCase();
}

function setupEmployeeSearch(inputId){
  const input = document.getElementById(inputId);
  const box = document.getElementById(`${inputId}Results`);
  if(!input || !box || input.dataset.ready === '1') return;

  input.dataset.ready = '1';

  const render = () => {
    const q = input.value.trim().toLowerCase();
    if(q.length < 2){
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }

    const normalized = normalizarCedula(q);
    const results = state.data.empleados
      .filter(e => {
        const text = empleadoSearchText(e);
        return text.includes(q) || (normalized && String(e.cedula || '').includes(normalized));
      })
      .slice(0, 12);

    if(!results.length){
      box.innerHTML = `<div class="search-empty">No encontré empleados con ese criterio.</div>`;
      box.classList.remove('hidden');
      return;
    }

    box.innerHTML = results.map(e => `
      <button type="button" class="search-result-item" data-cedula="${e.cedula}">
        <strong>${formatearCedula(e.cedula)} · ${e.nombre}</strong>
        <span>${e.cargo || '-'} · ${e.departamento || '-'} · ${e.estatus || e.estado || ''}</span>
      </button>
    `).join('');

    box.classList.remove('hidden');
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', render);

  box.addEventListener('click', ev => {
    const btn = ev.target.closest('.search-result-item');
    if(!btn) return;
    input.value = formatearCedula(btn.dataset.cedula);
    box.classList.add('hidden');

    if(inputId === 'buscarCedula') consultarEmpleado();
    if(inputId === 'certCedula') previewCert();
  });

  document.addEventListener('click', ev => {
    if(!input.contains(ev.target) && !box.contains(ev.target)) {
      box.classList.add('hidden');
    }
  });
}
function renderEmpleados(){
  document.getElementById('empleadosTable').innerHTML = state.data.empleados.map(e=>{
    const estatus = e.estatus_nomina || e.estado || '';
    const badgeClass = String(estatus).toLowerCase().includes('activo') && !String(estatus).toLowerCase().includes('des') ? 'ok' : 'danger';
    return `<tr><td><span class="badge ${badgeClass}">${estatus}</span></td><td>${formatearCedula(e.cedula)}</td><td><strong>${e.nombre}</strong></td><td>${e.cargo||''}</td><td>${e.departamento||''}</td><td>${generoTexto(e.genero)}</td><td>${money(e.sueldo)}</td><td>${mostrarFecha(e.fecha_ingreso)}</td></tr>`;
  }).join('') || '<tr><td colspan="8">Sin datos</td></tr>';
}
function findEmp(ced){ const c=normalizarCedula(ced); return state.data.empleados.find(e=>e.cedula===c); }

function balanceEmpleado(e, ref=hoyISO()){
  // Nube profesional: saldo solo nace en la institución actual; tiempo reconocido se agregará luego desde tabla periodos_reconocidos.
  const anios = aniosCumplidos(e.fecha_ingreso, ref);
  if(anios < 1) return {periodos:[], total:0, anios};
  const refDate=parseFecha(ref); let actual=aniversario(e.fecha_ingreso, refDate.getFullYear()); if(refDate<actual) actual=aniversario(e.fecha_ingreso, refDate.getFullYear()-1);
  const ant=aniversario(e.fecha_ingreso, actual.getFullYear()-1);
  const periods=[{tipo:'anterior',inicio:isoFecha(ant),fin:isoFecha(addDays(actual,-1))},{tipo:'actual',inicio:isoFecha(actual),fin:isoFecha(addDays(aniversario(e.fecha_ingreso, actual.getFullYear()+1),-1))}].filter(p=>aniosCumplidos(e.fecha_ingreso,p.inicio)>=1);
  const scale = anios >= 15 ? 30 : anios >= 10 ? 25 : anios >= 5 ? 20 : 15;
  const periodos=periods.map(p=>({...p,generados:scale,consumidos:0,disponibles:scale}));
  return {periodos,total:periodos.reduce((s,p)=>s+p.disponibles,0),anios};
}
function consultarEmpleado(){
  const e=findEmp(document.getElementById('buscarCedula').value); if(!e) return toast('Empleado no encontrado','error');
  document.getElementById('empleadoFicha').classList.remove('hidden');
  document.getElementById('empleadoFicha').innerHTML = `<strong>${e.nombre}</strong><br>${formatearCedula(e.cedula)} · ${e.cargo||''} · ${e.departamento||''}<br>Estatus: ${e.estatus_nomina || e.estado || ''} · ${generoTexto(e.genero)} · ${money(e.sueldo)} · Ingreso ${mostrarFecha(e.fecha_ingreso)}`;
  const b=balanceEmpleado(e, document.getElementById('fechaReferencia').value);
  document.getElementById('balTotal').textContent=b.total; document.getElementById('balAnterior').textContent=b.periodos.find(p=>p.tipo==='anterior')?.disponibles||0; document.getElementById('balActual').textContent=b.periodos.find(p=>p.tipo==='actual')?.disponibles||0; document.getElementById('balAnios').textContent=b.anios;
  document.getElementById('balanceTable').innerHTML=b.periodos.map(p=>`<tr><td>${p.tipo}</td><td>${mostrarFecha(p.inicio)}</td><td>${mostrarFecha(p.fin)}</td><td>${p.generados}</td><td>${p.consumidos}</td><td><strong>${p.disponibles}</strong></td></tr>`).join('') || '<tr><td colspan="6">Sin períodos disfrutables en OGTIC.</td></tr>';
}
function renderSolicitudes(){
  document.getElementById('solicitudesTable').innerHTML=state.data.solicitudes.map(s=>`<tr><td>${s.empleados?.nombre||''}<br>${formatearCedula(s.empleados?.cedula||'')}</td><td>${mostrarFecha(s.fecha_inicio)} al ${mostrarFecha(s.fecha_fin)}</td><td>${s.dias_solicitados}</td><td><span class="badge ${s.estado==='pendiente'?'warn':'ok'}">${s.estado}</span></td><td>${isAdmin()&&s.estado==='pendiente'?`<button class="btn secondary" onclick="aprobarSolicitud('${s.id}')">Aprobar</button>`:''}</td></tr>`).join('') || '<tr><td colspan="5">Sin solicitudes</td></tr>';
}
async function crearSolicitud(){
  const e=findEmp(document.getElementById('solCedula').value); if(!e) return toast('Empleado no encontrado','error');
  const inicio=document.getElementById('solInicio').value, fin=document.getElementById('solFin').value;
  if(!inicio||!fin) return toast('Completa fechas','error');
  const dias=Math.max(1, Math.round((parseFecha(fin)-parseFecha(inicio))/86400000)+1);
  const {error}=await sb.from('vacaciones_solicitudes').insert({empleado_id:e.id, fecha_inicio:inicio, fecha_fin:fin, dias_solicitados:dias, estado:'pendiente', observacion:document.getElementById('solObs').value});
  if(error) return toast(error.message,'error'); toast('Solicitud registrada'); await loadData();
}
async function aprobarSolicitud(id){ const {error}=await Api.update('vacaciones_solicitudes',id,{estado:'aprobada', fecha_aprobacion:new Date().toISOString()}); if(error)return toast(error.message,'error'); await loadData(); }

function renderFeriados(){
  document.getElementById('feriadosTable').innerHTML=state.data.feriados.map(f=>`<tr><td>${mostrarFecha(f.fecha)}</td><td>${f.descripcion}</td><td class="admin-only ${isAdmin()?'':'hidden'}"><button class="btn secondary" onclick="borrarFeriado('${f.id}')">Eliminar</button></td></tr>`).join('') || '<tr><td colspan="3">Sin feriados</td></tr>';
}
async function guardarFeriado(){ const fecha=document.getElementById('ferFecha').value, descripcion=document.getElementById('ferDesc').value; if(!fecha||!descripcion)return; const {error}=await Api.insert('feriados',{fecha,descripcion}); if(error)return toast(error.message,'error'); await loadData(); }
async function borrarFeriado(id){ if(!confirm('¿Eliminar feriado?'))return; const {error}=await Api.remove('feriados',id); if(error)return toast(error.message,'error'); await loadData(); }

function renderInactivos(){
  const elegibles = state.data.empleados.filter(e =>
    e.estado==='inactivo' &&
    e.considerar_liquidacion_vacaciones === true &&
    (e.fecha_marcado_inactivo || e.fecha_desvinculacion || '') >= FECHA_CORTE_INACTIVOS_VACACIONES
  );

  document.getElementById('inactivosTable').innerHTML=elegibles.map(e=>{
    const fechaRef=e.fecha_desvinculacion||e.fecha_marcado_inactivo||hoyISO();
    const b=balanceEmpleado(e,fechaRef);
    const vd=Number(e.ultimo_sueldo_mensual_completo||e.sueldo||0)/21.67;
    return `<tr><td>${formatearCedula(e.cedula)}</td><td>${e.nombre}</td><td>${money(e.ultimo_sueldo_mensual_completo||e.sueldo)}</td><td>${mostrarFecha(fechaRef)}</td><td>${b.total}</td><td>${money(vd)}</td><td>${money(vd*b.total)}</td></tr>`;
  }).join('')||'<tr><td colspan="7">Sin inactivos elegibles desde el 25/06/2026</td></tr>';
}
async function calcularInactivos(){ toast('Cálculo mostrado en pantalla. Guardado de liquidaciones se implementa en siguiente iteración.'); }

function renderTickets(){
  document.getElementById('ticketsTable').innerHTML=state.data.tickets.map(t=>`<tr><td>${mostrarFecha(t.created_at)}</td><td>${t.tipo}</td><td>${formatearCedula(t.cedula_relacionada||'')}</td><td><span class="badge ${t.estado==='abierto'?'warn':'ok'}">${t.estado}</span></td><td>${t.detalle}</td><td class="admin-only ${isAdmin()?'':'hidden'}">${t.estado==='abierto'?`<button class="btn secondary" onclick="cerrarTicket('${t.id}')">Cerrar</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6">Sin tickets</td></tr>';
}
async function crearTicket(){ const {error}=await Api.insert('tickets',{tipo:document.getElementById('ticketTipo').value, cedula_relacionada:normalizarCedula(document.getElementById('ticketCedula').value)||null, detalle:document.getElementById('ticketDetalle').value, estado:'abierto'}); if(error)return toast(error.message,'error'); toast('Ticket enviado'); await loadData(); }
async function cerrarTicket(id){ const {error}=await Api.update('tickets',id,{estado:'cerrado'}); if(error)return toast(error.message,'error'); await loadData(); }

let wb=null;
document.getElementById('nominaFile').addEventListener('change',e=>{const file=e.target.files[0]; if(!file)return; const r=new FileReader(); r.onload=ev=>{wb=XLSX.read(new Uint8Array(ev.target.result),{type:'array',cellDates:true}); document.getElementById('nominaSheet').innerHTML=wb.SheetNames.map(s=>`<option>${s}</option>`).join('');}; r.readAsArrayBuffer(file);});
function rowVal(row,names){ const keys=Object.keys(row); const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''); const k=keys.find(k=>names.map(norm).includes(norm(k))); return k?row[k]:''; }
async function procesarNomina(){
  if(!isAdmin())return toast('Solo admin','error');
  if(!wb)return toast('Carga un Excel','error');

  const rows=XLSX.utils.sheet_to_json(wb.Sheets[document.getElementById('nominaSheet').value],{defval:'',raw:false});
  const actuales=state.data.empleados.filter(e=>e.estado==='activo');
  const cedulasNuevas=new Set();

  const upserts=[];
  const vistos=new Set();
  let duplicados=0;

  for (const r of rows) {
    const ced=normalizarCedula(rowVal(r,['cedula','cédula']));
    if(!ced) continue;
    if(vistos.has(ced)){ duplicados++; continue; }
    vistos.add(ced);
    cedulasNuevas.add(ced);

    const nombre=String(rowVal(r,['nombre'])).trim();
    const fechaIngreso=isoFecha(rowVal(r,['fecha ingreso','fecha de ingreso']));
    if(!nombre || !fechaIngreso) continue;

    upserts.push({
      cedula:ced,
      nombre,
      cargo:String(rowVal(r,['cargo','puesto'])).trim(),
      departamento:String(rowVal(r,['departamento','direccion'])).trim(),
      grupo_ocupacional:String(rowVal(r,['grupo ocupacional','grupo','categoría de servidores públicos','categoria de servidores publicos'])).trim(),
      genero:normalizarGenero(rowVal(r,['genero','género','sexo'])),
      sueldo:Number(String(rowVal(r,['sueldo','salario'])).replace(/[RD$,\s]/g,''))||0,
      fecha_ingreso:fechaIngreso,

      // Importante:
      // estatus_nomina viene del histórico y sirve para certificaciones: labora/laboró.
      // estado queda como lógica interna del sistema para vacaciones.
      estado:'activo',
      tipo_servidor_publico:String(rowVal(r,['tipo de servidor público','tipo de servidor publico','tipo_servidor_publico'])).trim(),
      categoria_servidor_publico:String(rowVal(r,['categoría de servidores públicos','categoria de servidores publicos','categoria_servidor_publico'])).trim(),
      estatus_nomina:String(rowVal(r,['estatus','estado nomina','estatus nomina'])).trim(),
      considerar_liquidacion_vacaciones:false
    });
  }

  const res=await Api.upsertEmpleados(upserts);
  if(res.error)return toast(res.error.message,'error');

  let missing=[];
  // Solo a partir del 25/06/2026 se marcarán inactivos para vacaciones no disfrutadas
  // por ausencia en una carga nueva.
  if (hoyISO() >= FECHA_CORTE_INACTIVOS_VACACIONES) {
    missing=actuales.filter(e=>!cedulasNuevas.has(e.cedula)).map(e=>e.id);
    if(missing.length){
      const r=await Api.marcarInactivos(missing);
      if(r.error)return toast(r.error.message,'error');
    }
  }

  toast(`Nómina histórica procesada: ${upserts.length}. Duplicados omitidos: ${duplicados}. Inactivos para vacaciones: ${missing.length}`);
  await loadData();
}
function plantillaExcel(){ const data=[['Nombre','Cedula','Genero','Fecha de Ingreso','Departamento','Cargo','Salario','Tipo de Servidor Público','Categoría de Servidores Públicos','Estatus'],['Juan Pérez','001-0000000-1','Masculino','01/06/2021','RRHH','Analista',55000,'Fijo','Estatuto simplificado','Activo']]; const ws=XLSX.utils.aoa_to_sheet(data); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Nomina'); XLSX.writeFile(wb,'plantilla_nomina_ogtic.xlsx'); }


function fechaLargaCertificacion(iso){
  const d=parseFecha(iso);
  if(!d) return '';
  const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${String(d.getDate()).padStart(2,'0')} de ${meses[d.getMonth()]} ${d.getFullYear()}`;
}
function segundoParrafoCertificacion(iso){
  const d=parseFecha(iso);
  if(!d) return 'Expedimos esta constancia a solicitud de la parte interesada.';
  const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `Expedimos esta constancia a los ${String(d.getDate()).padStart(2,'0')} días del mes de ${meses[d.getMonth()]} ${d.getFullYear()}, a solicitud de la parte interesada.`;
}
function verboCertificacion(estatus){
  const s=String(estatus||'').toLowerCase();
  return s.includes('desvinc') || s.includes('inactivo') || s.includes('retir') ? 'laboró' : 'labora';
}
function previewCert(){
  const e=findEmp(document.getElementById('certCedula').value);
  if(!e){ toast('Empleado no encontrado','error'); return false; }

  const oficio=document.getElementById('certOficio').value||'RRHH- ____-__';
  const fecha=document.getElementById('certFecha').value||hoyISO();
  document.getElementById('certPOficio').textContent=oficio;
  document.getElementById('certPFecha').innerHTML=`Santo Domingo, D.N.<br>${fechaLargaCertificacion(fecha)}.`;

  const tr=normalizarGenero(e.genero)==='F'?['la','Sra.']:['el','Sr.'];
  const verbo=verboCertificacion(e.estatus_nomina);

  document.getElementById('certP1').innerHTML=
    `Por este medio hacemos constar que ${tr[0]} ${tr[1]} <strong>${e.nombre}</strong>, Cédula de Identidad y Electoral <strong>Núm. ${formatearCedula(e.cedula)}</strong>, ${verbo} en esta Institución desde el ${mostrarFecha(e.fecha_ingreso)}, desempeñándose como <strong>${e.cargo||''}</strong>, devengando un salario mensual de <strong>${money(e.sueldo)} (${salarioLetras(e.sueldo)})</strong>.`;

  document.getElementById('certP2').textContent=segundoParrafoCertificacion(fecha);
  document.getElementById('certIniciales').textContent=`VM/${document.getElementById('certElaboro').value||'-'}-`;
  return true;
}

function imprimirCertificacion(){
  if(previewCert() === false) return;

  const cert = document.getElementById('certPrintArea');
  if(!cert) return;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden','true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  document.body.appendChild(iframe);

  const baseUrl = window.location.href.replace(/[^/]*$/, '');
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(node => node.outerHTML)
    .join('\n');

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <base href="${baseUrl}">
  <title>Certificación</title>
  ${styles}
  <style>
    @page { size: letter; margin: 0; }
    html, body {
      width: 8.5in !important;
      height: 11in !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: #fff !important;
    }
    body { display: block !important; }
    #certPrintArea, .cert-page {
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      width: 8.5in !important;
      height: 11in !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      transform: none !important;
      box-shadow: none !important;
      page-break-before: avoid !important;
      page-break-after: avoid !important;
      break-before: avoid-page !important;
      break-after: avoid-page !important;
    }
    #certPrintArea *, .cert-page * { visibility: visible !important; }
    .cert-bg { display: block !important; }
  </style>
</head>
<body>${cert.outerHTML}</body>
</html>`);
  doc.close();

  const printNow = () => {
    const win = iframe.contentWindow;
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 1500);
  };

  const waitForAssets = async () => {
    const imgs = Array.from(doc.images);
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    })));

    if(doc.fonts && doc.fonts.ready){
      try { await doc.fonts.ready; } catch(_) {}
    }

    setTimeout(printNow, 150);
  };

  waitForAssets();
}

async function guardarCert(){ const e=findEmp(document.getElementById('certCedula').value); if(!e)return; const {error}=await Api.insert('certificaciones',{empleado_id:e.id, numero_oficio:document.getElementById('certOficio').value, fecha_emision:document.getElementById('certFecha').value, iniciales_firma:'VM', iniciales_elaboro:document.getElementById('certElaboro').value}); if(error)return toast(error.message,'error'); toast('Certificación guardada'); await loadData(); }

function exportBackup(){ const blob=new Blob([JSON.stringify(state.data,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`respaldo_ogtic_${hoyISO()}.json`; a.click(); URL.revokeObjectURL(url); }

document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById(`page-${b.dataset.page}`).classList.add('active');});
document.getElementById('btnLogin').onclick=async()=>{const email=document.getElementById('loginEmail').value,password=document.getElementById('loginPassword').value;const {error}=await sb.auth.signInWithPassword({email,password}); if(error){document.getElementById('loginMsg').textContent=error.message;return;} await boot();};
document.getElementById('btnLogout').onclick=async()=>{await sb.auth.signOut(); location.reload();};
document.getElementById('btnBuscarEmpleado').onclick=consultarEmpleado;
document.getElementById('btnCrearSolicitud').onclick=crearSolicitud;
document.getElementById('btnGuardarFeriado').onclick=guardarFeriado;
document.getElementById('btnCalcularInactivos').onclick=calcularInactivos;
document.getElementById('btnCrearTicket').onclick=crearTicket;
document.getElementById('btnProcesarNomina').onclick=procesarNomina;
document.getElementById('btnPlantillaExcel').onclick=plantillaExcel;
document.getElementById('btnPreviewCert').onclick=previewCert;
document.getElementById('btnGuardarCert').onclick=guardarCert;
document.getElementById('btnPrintCert').onclick=imprimirCertificacion;
document.getElementById('btnExportBackup').onclick=exportBackup;
document.getElementById('btnTicketEmpleado').onclick=()=>{document.querySelector('[data-page="tickets"]').click(); document.getElementById('ticketCedula').value=document.getElementById('buscarCedula').value;};

async function boot(){ const {data:{session}}=await sb.auth.getSession(); if(!session)return; state.profile=await Api.profile(); document.getElementById('loginScreen').classList.add('hidden'); document.getElementById('appShell').classList.remove('hidden'); await loadData(); }
boot();
window.aprobarSolicitud=aprobarSolicitud; window.borrarFeriado=borrarFeriado; window.cerrarTicket=cerrarTicket;
