async function selectAllRows(table, columns='*', orderColumn=null){
  const pageSize = 1000;
  let from = 0;
  let all = [];

  while (true) {
    let q = sb.from(table).select(columns).range(from, from + pageSize - 1);
    if (orderColumn) q = q.order(orderColumn);
    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    all = all.concat(rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

const Api = {
  async profile(){
    const { data:{ user } } = await sb.auth.getUser();
    if(!user) return null;

    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if(error) throw error;
    return data;
  },

  async all(){
    try {
      const [
        empleados,
        feriados,
        solicitudes,
        certificaciones,
        liquidaciones,
        tickets
      ] = await Promise.all([
        selectAllRows('empleados','*','nombre'),
        selectAllRows('feriados','*','fecha'),
        selectAllRows('vacaciones_solicitudes','*, empleados(nombre, cedula)','created_at'),
        selectAllRows('certificaciones','*, empleados(nombre, cedula)','created_at'),
        selectAllRows('inactivos_liquidaciones','*, empleados(nombre, cedula)','created_at'),
        selectAllRows('tickets','*','created_at')
      ]);

      solicitudes.reverse();
      certificaciones.reverse();
      liquidaciones.reverse();
      tickets.reverse();

      return { empleados, feriados, solicitudes, certificaciones, liquidaciones, tickets };
    } catch (err) {
      console.error('Error cargando datos:', err);
      throw new Error(err.message || 'No se pudieron cargar los datos.');
    }
  },

  async upsertEmpleados(rows){
    return sb.from('empleados').upsert(rows,{onConflict:'cedula'}).select();
  },

  async marcarInactivos(ids){
    return sb
      .from('empleados')
      .update({estado:'inactivo', fecha_desvinculacion:hoyISO()})
      .in('id', ids);
  },

  async insert(table,row){
    return sb.from(table).insert(row).select().single();
  },

  async update(table,id,row){
    return sb.from(table).update(row).eq('id',id).select().single();
  },

  async remove(table,id){
    return sb.from(table).delete().eq('id',id);
  }
};
