import { ProposedChange } from '../proposed-changes/proposed-changes.entity';

export function buildProposedChangesReportHtml(changes: ProposedChange[]): string {
  const rows = changes
    .map(
      (change) => `
      <tr>
        <td>${change.channelName}</td>
        <td>${change.programName}</td>
        <td>${change.action}</td>
        <td>${JSON.stringify(change.after, null, 2).replace(/\n/g, '<br>')}</td>
      </tr>
    `
    )
    .join('');

  return `
    <h2>Cambios propuestos</h2>
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr>
          <th>Canal</th>
          <th>Programa</th>
          <th>Acción</th>
          <th>Datos nuevos</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}
