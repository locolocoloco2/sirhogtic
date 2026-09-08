const FECHA_CORTE_INACTIVOS_VACACIONES = '2026-06-25';
let state = { profile:null, data:{empleados:[],feriados:[],solicitudes:[],certificaciones:[],liquidaciones:[],tickets:[],acciones:[]}, workbook:null };

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
    await cargarHistorialAcciones();
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
  setupEmployeeSearch('apCedula');
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
    if(inputId === 'apCedula') autofillAccion();
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

function fechaExtendidaCertificacion(valor){
  const d=parseFecha(valor);
  if(!d) return '';
  const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${String(d.getDate()).padStart(2,'0')} de ${meses[d.getMonth()]} del año ${d.getFullYear()}`;
}
function tratamientoCertificacion(e){
  return normalizarGenero(e.genero)==='F' ? ['la','Sra.'] : ['el','Sr.'];
}
function primerApellidoCertificacion(nombre){
  const partes=String(nombre||'').trim().split(/\s+/).filter(Boolean);
  if(partes.length>=3) return partes[partes.length-2];
  if(partes.length>=2) return partes[partes.length-1];
  return partes[0] || '';
}
function segundoParrafoVacaciones(e, textoVacaciones){
  const limpio=String(textoVacaciones||'').trim().replace(/\.$/, '');
  if(!limpio) return '';
  const tr=tratamientoCertificacion(e);
  const apellido=primerApellidoCertificacion(e.nombre);
  const sujeto=apellido ? `${tr[1]} ${apellido}` : tr[1];
  return `En ese mismo orden, hacemos de su conocimiento que ${tr[0]} ${sujeto}, tiene ${limpio}.`;
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

  const tr=tratamientoCertificacion(e);
  const fechaSalida=document.getElementById('certFechaSalida')?.value || e.fecha_desvinculacion || '';
  const esLaboro=Boolean(fechaSalida) || verboCertificacion(e.estatus_nomina)==='laboró';
  const verbo=esLaboro ? 'laboró' : 'labora';
  const fechaIngresoTexto=fechaExtendidaCertificacion(e.fecha_ingreso) || mostrarFecha(e.fecha_ingreso);
  const fechaSalidaTexto=fechaExtendidaCertificacion(fechaSalida);
  const tramoLaboral=esLaboro && fechaSalidaTexto
    ? `${verbo} en esta Institución desde el ${fechaIngresoTexto} hasta el ${fechaSalidaTexto}`
    : `${verbo} en esta Institución desde el ${fechaIngresoTexto}`;

  document.getElementById('certP1').innerHTML=
    `Por este medio hacemos constar que ${tr[0]} ${tr[1]} <strong>${e.nombre}</strong>, Cédula de Identidad y Electoral <strong>Núm. ${formatearCedula(e.cedula)}</strong>, ${tramoLaboral}, desempeñándose como <strong>${e.cargo||''}</strong>, devengando un salario mensual de <strong>${money(e.sueldo)} (${salarioLetras(e.sueldo)})</strong>.`;

  const vacacionesTexto=document.getElementById('certVacaciones')?.value || '';
  const parrafoVacaciones=segundoParrafoVacaciones(e, vacacionesTexto);
  const certP2=document.getElementById('certP2');
  certP2.textContent=parrafoVacaciones;
  certP2.style.display=parrafoVacaciones ? 'block' : 'none';

  // El párrafo de expedición debe aparecer siempre, exista o no información de vacaciones.
  document.getElementById('certP3').textContent=segundoParrafoCertificacion(fecha);
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

/* =========================================================
   Acciones de Personal (Formulario de Acción de Personal)
   ========================================================= */
const AP_NATURALEZA = [
  { grupo:'Designación', cell:'apvNatDesignacion', items:[
    ['nombramiento_ordinario','Nombramiento ordinario'],
    ['contrato_temporal','Por contrato temporal'],
    ['sustitucion','Sustitución'],
    ['reingreso','Re- ingreso'],
    ['asignacion','Asignación'],
    ['periodo_prueba','Periodo de prueba'],
    ['transitorio','Transitorio'],
  ]},
  { grupo:'Cambio', cell:'apvNatCambio', items:[
    ['ascenso','Ascenso'],
    ['reclasificacion','Reclasificación'],
    ['aumento_sueldo','Aumento de sueldo'],
    ['traslado','Traslado'],
    ['ajuste_salarial','Ajuste salarial'],
    ['promocion','Promoción'],
  ]},
  { grupo:'Licencia', cell:'apvNatLicencia', items:[
    ['con_sueldo','Con sueldo'],
    ['sin_sueldo','Sin sueldo'],
    ['por_enfermedad','Por enfermedad'],
    ['por_maternidad','Por maternidad'],
    ['estudio_con_sueldo','Por estudio con sueldo'],
    ['estudio_sin_sueldo','Por estudio sin sueldo'],
  ]},
  { grupo:'Separación del servicio', cell:'apvNatSeparacion', items:[
    ['renuncia','Renuncia'],
    ['terminacion_contrato','Terminación de contrato'],
    ['suspension_cargo','Suspensión de cargo'],
    ['abandono_cargo','Abandono de cargo'],
    ['fallecimiento','Fallecimiento'],
    ['destitucion_cargo','Destitución de cargo'],
  ]},
];
const AP_CAMBIO_KEYS = new Set(AP_NATURALEZA[1].items.map(i=>i[0]));
const AP_LICENCIA_KEYS = new Set(AP_NATURALEZA[2].items.map(i=>i[0]));
const apSelected = new Set();

function renderApNaturalezaInputs(){
  const cont = document.getElementById('apNaturaleza');
  if(!cont) return;
  cont.innerHTML = AP_NATURALEZA.map(g=>`
    <div class="ap-nat-col">
      <h4>${g.grupo}</h4>
      ${g.items.map(([k,label])=>`
        <label class="ap-nat-opt"><input type="checkbox" data-ap-nat="${k}"> <span>${label}</span></label>
      `).join('')}
    </div>`).join('');
  cont.querySelectorAll('input[data-ap-nat]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      const k = chk.dataset.apNat;
      if(chk.checked) apSelected.add(k); else apSelected.delete(k);
      chk.closest('.ap-nat-opt')?.classList.toggle('checked', chk.checked);
      apToggleSections();
      previewAccion();
    });
  });
}

function apToggleSections(){
  const hayCambio = [...apSelected].some(k=>AP_CAMBIO_KEYS.has(k));
  const hayLicencia = [...apSelected].some(k=>AP_LICENCIA_KEYS.has(k));
  document.getElementById('apCambioSection').classList.toggle('hidden', !hayCambio);
  document.getElementById('apLicenciaRango').classList.toggle('hidden', !hayLicencia);
}

function autofillAccion(){
  const e = findEmp(document.getElementById('apCedulaVal').value || document.getElementById('apCedula').value);
  if(!e){ toast('Colaborador no encontrado','error'); return; }
  document.getElementById('apNombre').value = e.nombre || '';
  document.getElementById('apCedulaVal').value = formatearCedula(e.cedula);
  document.getElementById('apCedula').value = formatearCedula(e.cedula);
  document.getElementById('apDepartamento').value = e.departamento || '';
  document.getElementById('apCargo').value = e.cargo || '';
  document.getElementById('apSueldo').value = e.sueldo || '';
  document.getElementById('apFechaIngreso').value = isoFecha(e.fecha_ingreso) || '';
  if(!document.getElementById('apSuperior').value) document.getElementById('apSuperior').value = 'Encargado del área';
  previewAccion();
}

function apCheckbox(marcado, label){
  return `<span class="${marcado?'on':''}">${marcado?'☒':'☐'} ${label}</span>`;
}

function setText(id, val){ const el=document.getElementById(id); if(el) el.textContent = val || ''; }
function setHtml(id, val){ const el=document.getElementById(id); if(el) el.innerHTML = val || ''; }

function previewAccion(){
  const sueldo = Number(document.getElementById('apSueldo').value||0);
  setText('apvNombre', document.getElementById('apNombre').value);
  setText('apvCedula', document.getElementById('apCedulaVal').value);
  setText('apvDepartamento', document.getElementById('apDepartamento').value);
  setText('apvSuperior', document.getElementById('apSuperior').value);
  setText('apvSede', document.getElementById('apSede').value);
  setText('apvCargo', document.getElementById('apCargo').value);
  setText('apvFechaIngreso', mostrarFecha(document.getElementById('apFechaIngreso').value));
  setText('apvSueldo', sueldo ? money(sueldo) : '');

  // Naturaleza: cada columna con sus casillas ☒/☐
  AP_NATURALEZA.forEach(g=>{
    let html = g.items.map(([k,label])=>apCheckbox(apSelected.has(k), label)).join('');
    if(g.grupo === 'Licencia'){
      const d1 = mostrarFecha(document.getElementById('apLicDesde').value);
      const d2 = mostrarFecha(document.getElementById('apLicHasta').value);
      const rango = (d1 || d2) ? `${d1||'____'} - ${d2||'____'}` : '';
      html += `<span class="ap-nat-rango">Desde- Hasta: ${rango}</span>`;
    }
    setHtml(g.cell, html);
  });

  // Cambio de datos laborales
  const aplica = document.getElementById('apCambioAplicaAumento').value;
  const salAprob = Number(document.getElementById('apCambioSalario').value||0);
  setText('apvCambioArea', document.getElementById('apCambioArea').value);
  setText('apvCambioSuperior', document.getElementById('apCambioSuperior').value);
  setText('apvCambioSede', document.getElementById('apCambioSede').value);
  setText('apvCambioCargo', document.getElementById('apCambioCargo').value);
  setText('apvCambioAumento', document.getElementById('apCambioSection').classList.contains('hidden') ? '' : aplica);
  setText('apvCambioSalario', salAprob ? money(salAprob) : '');

  // Información
  setText('apvMotivacion', document.getElementById('apMotivacion').value);
  setText('apvFechaAccion', mostrarFecha(document.getElementById('apFechaAccion').value));
  return true;
}

function imprimirAccion(){
  // Imprime EXACTAMENTE la vista previa (mismo DOM y estilos); las reglas
  // @media print aíslan la hoja. Antes se usaba un iframe que reescalaba y
  // recoloreaba el contenido; la impresión directa evita esas diferencias.
  previewAccion();
  window.print();
}

async function guardarAccion(){
  if(apSelected.size === 0) return toast('Marca al menos una naturaleza de la acción','error');
  const fechaAccion = document.getElementById('apFechaAccion').value;
  if(!fechaAccion) return toast('Indica la fecha de la acción','error');
  const nombre = document.getElementById('apNombre').value.trim();
  if(!nombre) return toast('Indica el nombre del colaborador','error');

  const e = findEmp(document.getElementById('apCedulaVal').value);
  const hayCambio = !document.getElementById('apCambioSection').classList.contains('hidden');
  const payload = {
    empleado_id: e ? e.id : null,
    nombre,
    cedula: normalizarCedula(document.getElementById('apCedulaVal').value) || null,
    direccion_departamento: document.getElementById('apDepartamento').value || null,
    superior_inmediato: document.getElementById('apSuperior').value || null,
    sede_trabajo: document.getElementById('apSede').value || null,
    cargo: document.getElementById('apCargo').value || null,
    fecha_ingreso: isoFecha(document.getElementById('apFechaIngreso').value) || null,
    sueldo: Number(document.getElementById('apSueldo').value||0),
    naturaleza: Array.from(apSelected),
    licencia_desde: isoFecha(document.getElementById('apLicDesde').value) || null,
    licencia_hasta: isoFecha(document.getElementById('apLicHasta').value) || null,
    cambio_area_trabajo: hayCambio ? (document.getElementById('apCambioArea').value || null) : null,
    cambio_superior_inmediato: hayCambio ? (document.getElementById('apCambioSuperior').value || null) : null,
    cambio_sede_trabajo: hayCambio ? (document.getElementById('apCambioSede').value || null) : null,
    cambio_cargo_aprobado: hayCambio ? (document.getElementById('apCambioCargo').value || null) : null,
    cambio_aplica_aumento: hayCambio && document.getElementById('apCambioAplicaAumento').value === 'Sí',
    cambio_salario_aprobado: hayCambio ? (Number(document.getElementById('apCambioSalario').value||0) || null) : null,
    motivacion: document.getElementById('apMotivacion').value || null,
    fecha_accion: fechaAccion
  };
  const {error} = await Api.insert('acciones_personal', payload);
  if(error) return toast(error.message,'error');
  toast('Acción de personal guardada en el historial');
  cargarHistorialAcciones();
}

// Último día del mes anterior respecto a una fecha de referencia (o a hoy).
function ultimoDiaMesAnterior(refISO){
  const r = parseFecha(refISO) || parseFecha(hoyISO());
  return isoFecha(new Date(r.getFullYear(), r.getMonth(), 0));
}
document.getElementById('btnApMotivIngreso').onclick=()=>{
  const f = fechaLargaCertificacion(document.getElementById('apFechaIngreso').value);
  document.getElementById('apMotivacion').value = f ? `Efectivo al ${f}` : 'Efectivo al ';
  previewAccion();
};
document.getElementById('btnApMotivSalida').onclick=()=>{
  // Salida: por defecto el último día del mes anterior (editable en el texto).
  const iso = ultimoDiaMesAnterior(document.getElementById('apFechaAccion').value);
  const f = fechaLargaCertificacion(iso);
  document.getElementById('apMotivacion').value = f ? `Efectivo al ${f}` : 'Efectivo al ';
  previewAccion();
};
['apNombre','apCedulaVal','apDepartamento','apSuperior','apSede','apCargo','apSueldo','apFechaIngreso',
 'apLicDesde','apLicHasta','apCambioArea','apCambioSuperior','apCambioSede','apCambioCargo',
 'apCambioAplicaAumento','apCambioSalario','apMotivacion','apFechaAccion'].forEach(id=>{
  const el = document.getElementById(id);
  if(el) el.addEventListener('input', previewAccion);
});
document.getElementById('btnPreviewAccion').onclick=previewAccion;
document.getElementById('btnGuardarAccion').onclick=guardarAccion;
document.getElementById('btnPrintAccion').onclick=imprimirAccion;

renderApNaturalezaInputs();
document.getElementById('apFechaAccion').value = hoyISO();
previewAccion();

/* ---------- Carga masiva de acciones por plantilla ---------- */
function apNormalizaTexto(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
// Mapa etiqueta/clave -> clave, para reconocer la naturaleza escrita en la plantilla.
const AP_LABEL2KEY = {};
AP_NATURALEZA.forEach(g => g.items.forEach(([k,label]) => {
  AP_LABEL2KEY[apNormalizaTexto(label)] = k;
  AP_LABEL2KEY[apNormalizaTexto(k)] = k;
}));
function apParseNaturaleza(txt){
  return String(txt||'').split(/[,;/|]+/).map(t => AP_LABEL2KEY[apNormalizaTexto(t)]).filter(Boolean);
}

const AP_PLANTILLA_HEADERS = [
  'Cédula','Nombre','Dirección/Departamento','Superior inmediato','Sede de trabajo','Cargo','Sueldo','Fecha de ingreso',
  'Naturaleza','Licencia desde','Licencia hasta',
  'Cambio - Área de trabajo','Cambio - Superior inmediato','Cambio - Sede de trabajo','Cargo aprobado','¿Aplica aumento? (Sí/No)','Salario aprobado',
  'Motivación','Fecha de la acción'
];

function plantillaAccionesExcel(){
  const ejemplos = [
    ['018-0044804-3','Nelson Elias Mota Espinosa','Dirección Administrativa y Financiera','Encargado del área','Punto GOB Sambil','Auxiliar Servicios Generales',30000,'01/09/2026','Nombramiento ordinario','','','','','','','No','','Efectivo al 01 de septiembre 2026','07/09/2026'],
    ['104-0015016-4','Demetrio Bens Turbi','Departamento de Seguridad','Encargado del área','Oficina Principal','Seguridad',15000,'01/04/2022','Destitución de cargo','','','','','','','No','','Efectivo al 31 de agosto 2026','07/09/2026'],
    ['001-1259534-3','Elpidio de Jesús West Batista','Dirección de Transformación Digital Gubernamental','Encargado de área','Oficina Principal','Analista de Datos',60000,'01/01/2015','Promoción','','','Dirección de Transformación Digital Gubernamental','Encargado de área','Oficina Principal','Analista de Estándares y Normativas','Sí',80000,'Efectivo al 01 de septiembre 2026','07/09/2026']
  ];
  const ws = XLSX.utils.aoa_to_sheet([AP_PLANTILLA_HEADERS, ...ejemplos]);
  ws['!cols'] = AP_PLANTILLA_HEADERS.map(() => ({ wch: 22 }));

  // Hoja de referencia con las naturalezas válidas (escríbelas tal cual en la columna Naturaleza).
  const ref = [['Grupo','Naturaleza (escríbela tal cual)']];
  AP_NATURALEZA.forEach(g => g.items.forEach(([,label]) => ref.push([g.grupo, label])));
  const wsRef = XLSX.utils.aoa_to_sheet(ref);
  wsRef['!cols'] = [{ wch: 22 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Acciones');
  XLSX.utils.book_append_sheet(wb, wsRef, 'Naturalezas válidas');
  XLSX.writeFile(wb, 'plantilla_acciones_personal.xlsx');
}

let apBulkWb = null;
function apBulkArchivoSeleccionado(e){
  const file = e.target.files[0];
  if(!file){ apBulkWb = null; return; }
  const r = new FileReader();
  r.onload = ev => {
    apBulkWb = XLSX.read(new Uint8Array(ev.target.result), { type:'array', cellDates:true });
    document.getElementById('apBulkMsg').textContent = `Archivo listo: ${file.name}. Pulsa "Procesar archivo".`;
  };
  r.readAsArrayBuffer(file);
}

async function procesarAccionesMasivo(){
  if(!apBulkWb) return toast('Carga primero un archivo Excel','error');
  const hoja = apBulkWb.SheetNames.find(n => apNormalizaTexto(n) === 'acciones') || apBulkWb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(apBulkWb.Sheets[hoja], { defval:'', raw:false });

  const payloads = [];
  const errores = [];

  rows.forEach((r, idx) => {
    const fila = idx + 2; // fila real en Excel (1 = encabezado)
    const nombre = String(rowVal(r, ['nombre'])).trim();
    const cedRaw = rowVal(r, ['cedula','cédula']);
    if(!nombre && !String(cedRaw).trim()) return; // fila vacía, se ignora

    const fechaAccion = isoFecha(rowVal(r, ['fecha de la accion','fecha de la acción','fecha accion']));
    if(!nombre){ errores.push(`Fila ${fila}: falta el Nombre.`); return; }
    if(!fechaAccion){ errores.push(`Fila ${fila}: falta la Fecha de la acción.`); return; }

    const ced = normalizarCedula(cedRaw);
    const emp = ced ? findEmp(ced) : null;
    const naturaleza = apParseNaturaleza(rowVal(r, ['naturaleza']));
    if(!naturaleza.length){ errores.push(`Fila ${fila}: la Naturaleza no coincide con ninguna válida (ver hoja "Naturalezas válidas").`); return; }

    const aplica = /^s/i.test(String(rowVal(r, ['aplica aumento (si/no)','aplica aumento','aplica aumento sino'])).trim());
    const salAprob = Number(String(rowVal(r, ['salario aprobado'])).replace(/[RD$,\s]/g,'')) || null;

    payloads.push({
      empleado_id: emp ? emp.id : null,
      nombre,
      cedula: ced || null,
      direccion_departamento: String(rowVal(r, ['direccion/departamento','dirección/departamento','departamento'])).trim() || null,
      superior_inmediato: String(rowVal(r, ['superior inmediato','superior/a inmediato/a'])).trim() || null,
      sede_trabajo: String(rowVal(r, ['sede de trabajo'])).trim() || null,
      cargo: String(rowVal(r, ['cargo'])).trim() || null,
      fecha_ingreso: isoFecha(rowVal(r, ['fecha de ingreso'])) || null,
      sueldo: Number(String(rowVal(r, ['sueldo','salario'])).replace(/[RD$,\s]/g,'')) || 0,
      naturaleza,
      licencia_desde: isoFecha(rowVal(r, ['licencia desde'])) || null,
      licencia_hasta: isoFecha(rowVal(r, ['licencia hasta'])) || null,
      cambio_area_trabajo: String(rowVal(r, ['cambio - area de trabajo','cambio - área de trabajo','area de trabajo'])).trim() || null,
      cambio_superior_inmediato: String(rowVal(r, ['cambio - superior inmediato'])).trim() || null,
      cambio_sede_trabajo: String(rowVal(r, ['cambio - sede de trabajo'])).trim() || null,
      cambio_cargo_aprobado: String(rowVal(r, ['cargo aprobado'])).trim() || null,
      cambio_aplica_aumento: aplica,
      cambio_salario_aprobado: salAprob,
      motivacion: String(rowVal(r, ['motivacion','motivación'])).trim() || null,
      fecha_accion: fechaAccion
    });
  });

  const result = document.getElementById('apBulkResult');
  result.classList.remove('hidden');

  if(!payloads.length){
    result.innerHTML = `<h4>No se registró ninguna acción</h4>${errores.length ? `<ul>${errores.map(e=>`<li class="err">${e}</li>`).join('')}</ul>` : '<p class="muted">El archivo no tenía filas válidas.</p>'}`;
    return;
  }

  document.getElementById('apBulkMsg').textContent = `Registrando ${payloads.length} acción(es)...`;
  const { data, error } = await sb.from('acciones_personal').insert(payloads).select();
  if(error){
    result.innerHTML = `<h4 class="err">Error al guardar</h4><p class="err">${error.message}</p>`;
    return;
  }

  document.getElementById('apBulkMsg').textContent = '';
  result.innerHTML = `<h4>Se registraron ${data.length} acción(es) en el historial ✔</h4>` +
    (errores.length ? `<p>Filas omitidas (${errores.length}):</p><ul>${errores.map(e=>`<li class="err">${e}</li>`).join('')}</ul>` : '') +
    `<p class="muted">Ya aparecen abajo en <strong>Historial · Acciones registradas</strong>, donde puedes imprimir cada una.</p>`;
  toast(`Carga masiva: ${data.length} acción(es) creada(s)`);
  cargarHistorialAcciones();
}

document.getElementById('btnApPlantilla').onclick = plantillaAccionesExcel;
document.getElementById('apBulkFile').addEventListener('change', apBulkArchivoSeleccionado);
document.getElementById('btnApBulkProcesar').onclick = procesarAccionesMasivo;

/* ---------- Historial de acciones ---------- */
const AP_KEY2LABEL = {};
AP_NATURALEZA.forEach(g => g.items.forEach(([k,label]) => { AP_KEY2LABEL[k] = label; }));
function accionNaturalezaLabels(a){
  return (a.naturaleza || []).map(k => AP_KEY2LABEL[k] || k).join(', ');
}

async function cargarHistorialAcciones(){
  const { data, error } = await sb.from('acciones_personal')
    .select('*').order('created_at', { ascending:false }).limit(1000);
  if(error){ console.warn('No se pudo cargar el historial de acciones:', error.message); return; }
  state.data.acciones = data || [];
  renderHistorialAcciones();
}

function renderHistorialAcciones(){
  const tb = document.getElementById('apHistTable');
  if(!tb) return;
  const rows = state.data.acciones || [];
  const cnt = document.getElementById('apHistCount');
  if(cnt) cnt.textContent = rows.length ? `${rows.length} registro(s)` : '';
  tb.innerHTML = rows.map(a => `<tr>
    <td>${mostrarFecha(a.fecha_accion)}</td>
    <td><strong>${a.nombre || ''}</strong></td>
    <td>${a.cedula ? formatearCedula(a.cedula) : ''}</td>
    <td>${accionNaturalezaLabels(a)}</td>
    <td>${mostrarFecha(a.created_at)}</td>
    <td><button class="btn secondary" onclick="imprimirAccionHistorial('${a.id}')">Imprimir</button></td>
  </tr>`).join('') || '<tr><td colspan="6">Aún no hay acciones registradas.</td></tr>';
}

// Pinta la hoja de vista previa a partir de una acción guardada (no de los inputs).
function pintarPreviewDesdeAccion(a){
  const nat = new Set(a.naturaleza || []);
  setText('apvNombre', a.nombre || '');
  setText('apvCedula', a.cedula ? formatearCedula(a.cedula) : '');
  setText('apvDepartamento', a.direccion_departamento || '');
  setText('apvSuperior', a.superior_inmediato || '');
  setText('apvSede', a.sede_trabajo || '');
  setText('apvCargo', a.cargo || '');
  setText('apvFechaIngreso', a.fecha_ingreso ? mostrarFecha(a.fecha_ingreso) : '');
  setText('apvSueldo', a.sueldo ? money(a.sueldo) : '');
  AP_NATURALEZA.forEach(g => {
    let html = g.items.map(([k,label]) => apCheckbox(nat.has(k), label)).join('');
    if(g.grupo === 'Licencia'){
      const d1 = a.licencia_desde ? mostrarFecha(a.licencia_desde) : '';
      const d2 = a.licencia_hasta ? mostrarFecha(a.licencia_hasta) : '';
      const rango = (d1 || d2) ? `${d1||'____'} - ${d2||'____'}` : '';
      html += `<span class="ap-nat-rango">Desde- Hasta: ${rango}</span>`;
    }
    setHtml(g.cell, html);
  });
  const hayCambio = (a.naturaleza||[]).some(k => AP_CAMBIO_KEYS.has(k)) ||
    a.cambio_area_trabajo || a.cambio_cargo_aprobado || a.cambio_sede_trabajo ||
    a.cambio_superior_inmediato || a.cambio_salario_aprobado;
  setText('apvCambioArea', a.cambio_area_trabajo || '');
  setText('apvCambioSuperior', a.cambio_superior_inmediato || '');
  setText('apvCambioSede', a.cambio_sede_trabajo || '');
  setText('apvCambioCargo', a.cambio_cargo_aprobado || '');
  setText('apvCambioAumento', hayCambio ? (a.cambio_aplica_aumento ? 'Sí' : 'No') : '');
  setText('apvCambioSalario', a.cambio_salario_aprobado ? money(a.cambio_salario_aprobado) : '');
  setText('apvMotivacion', a.motivacion || '');
  setText('apvFechaAccion', a.fecha_accion ? mostrarFecha(a.fecha_accion) : '');
}

function imprimirAccionHistorial(id){
  const a = (state.data.acciones || []).find(x => x.id === id);
  if(!a) return toast('Acción no encontrada','error');
  pintarPreviewDesdeAccion(a);
  document.getElementById('apPrintArea').scrollIntoView({ block:'start' });
  setTimeout(() => window.print(), 60);
}
window.imprimirAccionHistorial = imprimirAccionHistorial;

async function boot(){ const {data:{session}}=await sb.auth.getSession(); if(!session)return; state.profile=await Api.profile(); document.getElementById('loginScreen').classList.add('hidden'); document.getElementById('appShell').classList.remove('hidden'); await loadData(); }
boot();
window.aprobarSolicitud=aprobarSolicitud; window.borrarFeriado=borrarFeriado; window.cerrarTicket=cerrarTicket;



/* =========================================================
   Menú hamburguesa móvil
   ========================================================= */
(function(){
  const btn = document.getElementById('mobileMenuBtn');
  const close = document.getElementById('mobileMenuClose');
  const overlay = document.getElementById('mobileOverlay');

  const openMenu = () => document.body.classList.add('menu-open');
  const closeMenu = () => document.body.classList.remove('menu-open');

  if (btn) btn.addEventListener('click', openMenu);
  if (close) close.addEventListener('click', closeMenu);
  if (overlay) overlay.addEventListener('click', closeMenu);

  document.querySelectorAll('.nav-btn').forEach(navBtn => {
    navBtn.addEventListener('click', () => {
      if (window.innerWidth <= 900) closeMenu();
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMenu();
  });
})();

/* =========================================================
   Filtros y paginación de tablas
   ========================================================= */
const tablePaginationState = {};

function normalizeTableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function ensureTableControls(tableId, placeholder='Filtrar tabla...') {
  const tableBody = document.getElementById(tableId);
  if (!tableBody) return null;

  const wrap = tableBody.closest('.table-wrap');
  if (!wrap) return null;

  const key = tableId;
  if (!tablePaginationState[key]) {
    tablePaginationState[key] = { page: 1, pageSize: 25, filter: '' };
  }

  let toolbar = document.getElementById(`${tableId}Toolbar`);
  let footer = document.getElementById(`${tableId}Footer`);

  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = `${tableId}Toolbar`;
    toolbar.className = 'table-toolbar';
    toolbar.innerHTML = `
      <div class="table-filter">
        <input id="${tableId}Filter" placeholder="${placeholder}" autocomplete="off">
      </div>
      <div class="table-page-size">
        <span>Filas por página</span>
        <select id="${tableId}PageSize">
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="250">250</option>
        </select>
      </div>
    `;
    wrap.parentNode.insertBefore(toolbar, wrap);

    const filterInput = toolbar.querySelector(`#${tableId}Filter`);
    const pageSizeSelect = toolbar.querySelector(`#${tableId}PageSize`);

    filterInput.addEventListener('input', () => {
      tablePaginationState[key].filter = filterInput.value;
      tablePaginationState[key].page = 1;
      renderAll();
    });

    pageSizeSelect.addEventListener('change', () => {
      tablePaginationState[key].pageSize = Number(pageSizeSelect.value) || 25;
      tablePaginationState[key].page = 1;
      renderAll();
    });
  }

  if (!footer) {
    footer = document.createElement('div');
    footer.id = `${tableId}Footer`;
    footer.className = 'table-footer';
    footer.innerHTML = `
      <span id="${tableId}Info"></span>
      <div class="table-pager">
        <button id="${tableId}Prev" type="button">Anterior</button>
        <span id="${tableId}Page" class="table-page-indicator">Página 1</span>
        <button id="${tableId}Next" type="button">Siguiente</button>
      </div>
    `;
    wrap.parentNode.insertBefore(footer, wrap.nextSibling);

    footer.querySelector(`#${tableId}Prev`).addEventListener('click', () => {
      tablePaginationState[key].page = Math.max(1, tablePaginationState[key].page - 1);
      renderAll();
    });

    footer.querySelector(`#${tableId}Next`).addEventListener('click', () => {
      tablePaginationState[key].page += 1;
      renderAll();
    });
  }

  return tablePaginationState[key];
}

function renderPaginatedTable({ tableId, rows, rowHtml, emptyHtml, filterPlaceholder }) {
  const tableBody = document.getElementById(tableId);
  if (!tableBody) return;

  const st = ensureTableControls(tableId, filterPlaceholder);
  if (!st) {
    tableBody.innerHTML = rows.map(rowHtml).join('') || emptyHtml;
    return;
  }

  const filter = normalizeTableText(st.filter);
  const filtered = filter
    ? rows.filter(row => normalizeTableText(row.__searchText || JSON.stringify(row)).includes(filter))
    : rows;

  const total = filtered.length;
  const pageSize = st.pageSize || 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  st.page = Math.min(Math.max(1, st.page || 1), totalPages);

  const start = (st.page - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  tableBody.innerHTML = visible.map(rowHtml).join('') || emptyHtml;

  const info = document.getElementById(`${tableId}Info`);
  const page = document.getElementById(`${tableId}Page`);
  const prev = document.getElementById(`${tableId}Prev`);
  const next = document.getElementById(`${tableId}Next`);

  if (info) {
    const from = total ? start + 1 : 0;
    const to = Math.min(start + pageSize, total);
    info.textContent = `Mostrando ${from}-${to} de ${total}`;
  }

  if (page) page.textContent = `Página ${st.page} de ${totalPages}`;
  if (prev) prev.disabled = st.page <= 1;
  if (next) next.disabled = st.page >= totalPages;
}

function empleadoRowSearch(e) {
  return [
    e.estado,
    e.estatus,
    e.estatus_nomina,
    e.cedula,
    formatearCedula(e.cedula),
    e.nombre,
    e.cargo,
    e.departamento,
    e.genero,
    e.sueldo,
    mostrarFecha(e.fecha_ingreso)
  ].join(' ');
}

renderEmpleados = function(){
  const rows = (state.data.empleados || []).map(e => ({ ...e, __searchText: empleadoRowSearch(e) }));

  renderPaginatedTable({
    tableId: 'empleadosTable',
    rows,
    filterPlaceholder: 'Filtrar por cédula, nombre, cargo, departamento o estatus...',
    emptyHtml: '<tr><td colspan="8">Sin datos</td></tr>',
    rowHtml: e => `<tr>
      <td><span class="badge ${typeof esActivoHistorico === 'function' && esActivoHistorico(e) ? 'ok' : 'danger'}">${e.estatus_nomina || e.estatus || e.estado || ''}</span></td>
      <td>${formatearCedula(e.cedula)}</td>
      <td><strong>${e.nombre || ''}</strong></td>
      <td>${e.cargo || ''}</td>
      <td>${e.departamento || ''}</td>
      <td>${generoTexto(e.genero)}</td>
      <td>${money(e.sueldo)}</td>
      <td>${mostrarFecha(e.fecha_ingreso)}</td>
    </tr>`
  });
};

renderSolicitudes = function(){
  const rows = (state.data.solicitudes || []).map(s => ({
    ...s,
    __searchText: [s.empleados?.nombre, s.empleados?.cedula, s.estado, s.observacion, mostrarFecha(s.fecha_inicio), mostrarFecha(s.fecha_fin)].join(' ')
  }));

  renderPaginatedTable({
    tableId: 'solicitudesTable',
    rows,
    filterPlaceholder: 'Filtrar solicitudes por empleado, estado o fecha...',
    emptyHtml: '<tr><td colspan="5">Sin solicitudes</td></tr>',
    rowHtml: s => `<tr>
      <td>${s.empleados?.nombre || ''}<br>${formatearCedula(s.empleados?.cedula || '')}</td>
      <td>${mostrarFecha(s.fecha_inicio)} al ${mostrarFecha(s.fecha_fin)}</td>
      <td>${s.dias_solicitados}</td>
      <td><span class="badge ${s.estado === 'pendiente' ? 'warn' : 'ok'}">${s.estado}</span></td>
      <td>${isAdmin() && s.estado === 'pendiente' ? `<button class="btn secondary" onclick="aprobarSolicitud('${s.id}')">Aprobar</button>` : ''}</td>
    </tr>`
  });
};

renderFeriados = function(){
  const rows = (state.data.feriados || []).map(f => ({
    ...f,
    __searchText: [mostrarFecha(f.fecha), f.descripcion].join(' ')
  }));

  renderPaginatedTable({
    tableId: 'feriadosTable',
    rows,
    filterPlaceholder: 'Filtrar feriados por fecha o descripción...',
    emptyHtml: '<tr><td colspan="3">Sin feriados</td></tr>',
    rowHtml: f => `<tr>
      <td>${mostrarFecha(f.fecha)}</td>
      <td>${f.descripcion}</td>
      <td class="admin-only ${isAdmin() ? '' : 'hidden'}"><button class="btn secondary" onclick="borrarFeriado('${f.id}')">Eliminar</button></td>
    </tr>`
  });
};

renderInactivos = function(){
  const fechaCorte = parseFecha('2026-06-25');
  const rows = (state.data.empleados || [])
    .filter(e => {
      const fechaDesv = parseFecha(e.fecha_desvinculacion);
      return e.estado === 'inactivo' && fechaDesv && fechaDesv >= fechaCorte;
    })
    .map(e => ({ ...e, __searchText: [e.cedula, formatearCedula(e.cedula), e.nombre, e.cargo, e.departamento, mostrarFecha(e.fecha_desvinculacion)].join(' ') }));

  renderPaginatedTable({
    tableId: 'inactivosTable',
    rows,
    filterPlaceholder: 'Filtrar inactivos por cédula, nombre, cargo o fecha...',
    emptyHtml: '<tr><td colspan="7">Sin inactivos liquidables desde el 25/06/2026.</td></tr>',
    rowHtml: e => {
      const b = balanceEmpleado(e, e.fecha_desvinculacion || hoyISO());
      const vd = Number(e.ultimo_sueldo_mensual_completo || e.sueldo || 0) / 21.67;
      return `<tr>
        <td>${formatearCedula(e.cedula)}</td>
        <td>${e.nombre}</td>
        <td>${money(e.ultimo_sueldo_mensual_completo || e.sueldo)}</td>
        <td>${mostrarFecha(e.fecha_desvinculacion)}</td>
        <td>${b.total}</td>
        <td>${money(vd)}</td>
        <td>${money(vd * b.total)}</td>
      </tr>`;
    }
  });
};

renderTickets = function(){
  const rows = (state.data.tickets || []).map(t => ({
    ...t,
    __searchText: [mostrarFecha(t.created_at), t.tipo, t.cedula_relacionada, t.estado, t.detalle].join(' ')
  }));

  renderPaginatedTable({
    tableId: 'ticketsTable',
    rows,
    filterPlaceholder: 'Filtrar tickets por tipo, cédula, estado o detalle...',
    emptyHtml: '<tr><td colspan="6">Sin tickets</td></tr>',
    rowHtml: t => `<tr>
      <td>${mostrarFecha(t.created_at)}</td>
      <td>${t.tipo}</td>
      <td>${formatearCedula(t.cedula_relacionada || '')}</td>
      <td><span class="badge ${t.estado === 'abierto' ? 'warn' : 'ok'}">${t.estado}</span></td>
      <td>${t.detalle}</td>
      <td class="admin-only ${isAdmin() ? '' : 'hidden'}">${t.estado === 'abierto' ? `<button class="btn secondary" onclick="cerrarTicket('${t.id}')">Cerrar</button>` : ''}</td>
    </tr>`
  });
};
