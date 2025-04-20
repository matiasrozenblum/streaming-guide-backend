import { ProposedChange } from '../proposed-changes/proposed-changes.entity';

export function buildProposedChangesReportHtml(changes: ProposedChange[]): string {
  const rows = changes
    .map((change) => {
      const before = change.before
        ? formatScheduleData(change.before, 'before')
        : '<div><em>(no existía)</em></div>';

      const after = change.after
        ? formatScheduleData(change.after, 'after')
        : '<div><em>(se eliminará)</em></div>';

      return `
        <tr>
          <td>${change.channelName}</td>
          <td>${change.programName}</td>
          <td>${formatAction(change.action)}</td>
          <td>${before}</td>
          <td>${after}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <h2>Cambios propuestos</h2>
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr>
          <th>Canal</th>
          <th>Programa</th>
          <th>Acción</th>
          <th>Antes (estado actual)</th>
          <th>Después (nuevo estado)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// Formatea el bloque de datos para mostrar: día, start, end
function formatScheduleData(data: any, type: 'before' | 'after') {
  const color = type === 'before' ? '#d9534f' : '#5cb85c'; // rojo o verde

  return `
    <div><strong>Día:</strong> <span style="color: ${color};">${data.day_of_week || '-'}</span></div>
    <div><strong>Inicio:</strong> <span style="color: ${color};">${normalizeTime(data.start_time)}</span></div>
    <div><strong>Fin:</strong> <span style="color: ${color};">${normalizeTime(data.end_time)}</span></div>
  `;
}

// Normaliza horas tipo "10" a "10:00" si falta el minuto
function normalizeTime(time?: string) {
  if (!time) return '-';
  return time.includes(':') ? time : `${time}:00`;
}

// Opcional: pone un emoji lindo en el tipo de acción
function formatAction(action: string) {
  if (action === 'create') return '➕ Crear';
  if (action === 'update') return '✏️ Actualizar';
  if (action === 'delete') return '❌ Eliminar';
  return action;
}
