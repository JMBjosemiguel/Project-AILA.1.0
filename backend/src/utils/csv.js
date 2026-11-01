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

module.exports = { csvEscape };
