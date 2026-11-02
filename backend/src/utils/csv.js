const { APP_TIMEZONE, appDateTimeStr } = require('./appTime');

// Escapes one CSV cell for the admin exports.
//  - A cell starting with = + - @ (or a tab / carriage return) would run as a
//    formula when opened in Excel or Sheets, so it gets a leading single quote.
//  - Cells containing a comma, a double quote or a line break (\n or \r) are
//    quoted, with embedded quotes doubled.
function csvEscape(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// The audit-log export. Starts with a UTF-8 byte order mark so Excel reads
// accented names correctly, and gives times in the app timezone, the
// same as the Audit Log page.
function buildAuditLogCsv(rows) {
  const header = [`Timestamp (${APP_TIMEZONE})`, 'User', 'Email', 'Role', 'Action', 'Target Table', 'Target ID', 'Affected Object'];
  const lines = [header.map(csvEscape).join(',')];
  for (const row of rows) {
    const affectedObject = row.target_name
      ? `${row.target_name}${row.target_id ? ` (#${row.target_id})` : ''}`
      : `${row.target_table}${row.target_id ? ` #${row.target_id}` : ''}`;
    lines.push([
      csvEscape(appDateTimeStr(row.created_at)),
      csvEscape(`${row.first_name} ${row.last_name}`),
      csvEscape(row.email),
      csvEscape(row.role),
      csvEscape(row.action),
      csvEscape(row.target_table),
      row.target_id ?? '',
      csvEscape(affectedObject),
    ].join(','));
  }
  return `﻿${lines.join('\n')}`;
}

module.exports = { csvEscape, buildAuditLogCsv };
