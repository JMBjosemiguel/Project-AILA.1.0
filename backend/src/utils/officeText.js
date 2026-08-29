const officeParser = require('officeparser');

async function extractOfficeText(buffer, fileType) {
  const ast = await officeParser.parseOffice(buffer, fileType ? { fileType } : {});
  const result = await ast.to('text');
  return (result?.value || '').trim();
}

module.exports = { extractOfficeText };
