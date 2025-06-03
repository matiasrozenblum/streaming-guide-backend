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

export function buildProgramNotificationHtml(
  programName: string,
  channelName: string,
  startTime: string,
  endTime: string,
  description?: string,
  logoUrl?: string
): string {
  const currentTime = new Date().toLocaleString('es-ES', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>¡${programName} comienza pronto!</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8fafc;
        }
        .container {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }
        .header {
          background: rgba(255,255,255,0.1);
          padding: 30px;
          text-align: center;
          color: white;
        }
        .logo {
          width: 40px;
          height: 60px;
          margin: 0 auto 15px;
          display: block;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
        }
        .header p {
          margin: 10px 0 0;
          font-size: 16px;
          opacity: 0.9;
        }
        .content {
          background: white;
          padding: 40px 30px;
        }
        .program-card {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border-radius: 12px;
          padding: 25px;
          margin: 20px 0;
          border-left: 4px solid #2563eb;
        }
        .program-header {
          display: flex;
          align-items: center;
          margin-bottom: 15px;
        }
        .program-logo {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          margin-right: 15px;
          background: #2563eb;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 22px;
        }
        .program-logo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }
        .program-info h2 {
          margin: 0;
          font-size: 22px;
          color: #1a237e;
          font-weight: 600;
        }
        .channel-badge {
          display: inline-block;
          background: #2563eb;
          color: white;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          margin-top: 5px;
        }
        .time-info {
          background: rgba(59, 130, 246, 0.08);
          border-radius: 8px;
          padding: 15px;
          margin: 15px 0;
        }
        .time-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 8px 0;
        }
        .time-label {
          font-weight: 600;
          color: #2563eb;
        }
        .time-value {
          font-size: 16px;
          font-weight: 500;
        }
        .description {
          color: #64748b;
          font-style: italic;
          margin: 15px 0;
          padding: 15px;
          background: #f1f5f9;
          border-radius: 8px;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          margin: 20px 0;
          text-align: center;
        }
        .footer {
          background: #f8fafc;
          padding: 25px 30px;
          text-align: center;
          color: #64748b;
          font-size: 14px;
        }
        .footer a {
          color: #2563eb;
          text-decoration: none;
        }
        @media (max-width: 600px) {
          body { padding: 10px; }
          .content { padding: 25px 20px; }
          .program-header { flex-direction: column; text-align: center; }
          .program-logo { margin: 0 0 10px 0; }
          .time-row { flex-direction: column; text-align: center; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
          <img src="https://laguiadelstreaming.com/img/logo.png" alt="La Guía del Streaming" class="logo" />
          <h1>¡Tu programa favorito comienza pronto!</h1>
          <p>No te pierdas ${programName}</p>
        </div>
        
        <div class="content">
          <div class="program-card">
            <div class="program-header">
              <div class="program-logo">
                ${logoUrl ? `<img src="${logoUrl}" alt="${programName}" />` : programName.charAt(0)}
              </div>
              <div class="program-info">
                <h2>${programName}</h2>
                <span class="channel-badge">${channelName}</span>
              </div>
            </div>
            
            <div class="time-info">
              <div class="time-row">
                <span class="time-label">⏰ Comienza en:</span>
                <span class="time-value">10 minutos</span>
              </div>
              <div class="time-row">
                <span class="time-label">🕐 Horario:</span>
                <span class="time-value">${startTime} - ${endTime}</span>
              </div>
            </div>
            
            ${description ? `<div class="description">"${description}"</div>` : ''}
          </div>
          
          <p style="text-align: center; color: #64748b; margin: 25px 0;">
            ¡Prepárate para disfrutar de tu contenido favorito! 🍿
          </p>
          
          <div style="text-align: center;">
            <a href="https://laguiadelstreaming.com" class="cta-button">
              Ver programación completa
            </a>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>La Guía del Streaming</strong></p>
          <p>Recibiste este email porque estás suscrito a notificaciones de ${programName}.</p>
          <p>
            <a href="https://laguiadelstreaming.com/subscriptions">Gestionar suscripciones</a> | 
            <a href="https://laguiadelstreaming.com/profile">Mi cuenta</a>
          </p>
          <p style="margin-top: 15px; font-size: 12px; opacity: 0.7;">
            ${currentTime}
          </p>
        </div>
      </div>
    </body>
    </html>
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
  
  // Remove any extra whitespace
  time = time.trim();
  
  // Handle different time formats
  // If it's already in HH:MM:SS format, convert to HH:MM
  if (time.includes(':')) {
    const parts = time.split(':');
    if (parts.length >= 2) {
      const hours = parts[0].padStart(2, '0');
      const minutes = parts[1].padStart(2, '0');
      return `${hours}:${minutes}`;
    }
  }
  
  // If it's just a number (like "16"), convert to "16:00"
  if (/^\d+$/.test(time)) {
    return `${time.padStart(2, '0')}:00`;
  }
  
  // If it's in format like "16h" or "16 h", extract the number
  const hourMatch = time.match(/^(\d+)h?$/i);
  if (hourMatch) {
    return `${hourMatch[1].padStart(2, '0')}:00`;
  }
  
  // Return as-is if we can't parse it
  return time;
}

// Opcional: pone un emoji lindo en el tipo de acción
function formatAction(action: string) {
  if (action === 'create') return '➕ Crear';
  if (action === 'update') return '✏️ Actualizar';
  if (action === 'delete') return '❌ Eliminar';
  return action;
}
