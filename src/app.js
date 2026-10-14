const $ = (id) => document.getElementById(id);
const artFile = $('artFile');
const dataFile = $('dataFile');
let csvRows = [];
let mappings = { SKU: '', Size: '', Price: '', Barcode: '', QR: '' };
let customFields = [];
let activeSection = 'workspace';

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
}
function headers() { return csvRows.length ? csvRows[0].map((h, i) => (String(h || '').trim() || `Column ${i + 1}`)) : []; }
function dataRecord(index = 1) {
  if (!csvRows.length) return {};
  const result = {};
  headers().forEach((h, i) => result[h] = (csvRows[index] || [])[i] ?? '');
  return result;
}
function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"' && quoted && next === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && next === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => String(v).trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field); if (row.some(v => String(v).trim() !== '')) rows.push(row);
  return rows;
}
function renderTable(rows) {
  const head = $('tableHead'), body = $('tableBody'); head.replaceChildren(); body.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.className = 'empty'; td.colSpan = 8; td.textContent = 'Your data preview will appear here.'; tr.appendChild(td); body.appendChild(tr); return;
  }
  const hr = document.createElement('tr');
  rows[0].forEach(value => { const th = document.createElement('th'); th.textContent = value || '(blank header)'; hr.appendChild(th); }); head.appendChild(hr);
  rows.slice(1, 7).forEach(row => {
    const tr = document.createElement('tr');
    rows[0].forEach((_, i) => { const td = document.createElement('td'); td.textContent = row[i] || ''; tr.appendChild(td); }); body.appendChild(tr);
  });
}
function setFileStatus(file) {
  $('dataName').textContent = file.name;
  $('dataDrop').querySelector('.file-symbol').textContent = file.name.split('.').pop().toUpperCase().slice(0, 4);
}
function fillMappingSelect(select, selected = '') {
  select.replaceChildren();
  const blank = document.createElement('option'); blank.value = ''; blank.textContent = '— Not mapped —'; select.appendChild(blank);
  headers().forEach(h => { const opt = document.createElement('option'); opt.value = h; opt.textContent = h; select.appendChild(opt); });
  select.value = selected;
}
function renderMapping() {
  const body = $('mappingBody'); body.replaceChildren();
  const fields = [
    { key: 'SKU', label: 'SKU / Item Code', hint: 'Product or tag code' },
    { key: 'Size', label: 'Size', hint: 'S, M, L, XL…' },
    { key: 'Price', label: 'Price', hint: 'Retail price' },
    { key: 'Barcode', label: 'Barcode', hint: 'Value to encode as barcode' },
    { key: 'QR', label: 'QR Code', hint: 'Value to encode as QR code' },
    ...customFields.map((f, i) => ({ key: `custom_${i}`, label: f, hint: 'Custom text field' }))
  ];
  if (!csvRows.length) {
    const p = document.createElement('p'); p.className = 'mapping-empty'; p.textContent = 'Import a CSV file first. Its column names will appear in these dropdowns.'; body.appendChild(p); updateMergePreview(); return;
  }
  fields.forEach(field => {
    const row = document.createElement('div'); row.className = 'mapping-row';
    const info = document.createElement('div'); info.className = 'mapping-label';
    const strong = document.createElement('strong'); strong.textContent = field.label;
    const small = document.createElement('small'); small.textContent = field.hint; info.append(strong, small);
    const select = document.createElement('select'); select.className = 'map-select'; select.dataset.key = field.key;
    fillMappingSelect(select, mappings[field.key] || '');
    select.addEventListener('change', () => { mappings[field.key] = select.value; updateMergePreview(); });
    row.append(info, select); body.appendChild(row);
  });
  updateMergePreview();
}
function updateMergePreview() {
  const rec = dataRecord(1);
  const area = $('mergePreview'); area.replaceChildren();
  const entries = [ ['SKU / Item Code', mappings.SKU], ['Size', mappings.Size], ['Price', mappings.Price], ['Barcode value', mappings.Barcode], ['QR value', mappings.QR], ...customFields.map((f, i) => [f, mappings[`custom_${i}`]]) ];
  entries.forEach(([label, column]) => {
    const item = document.createElement('div'); item.className = 'preview-field';
    const k = document.createElement('span'); k.textContent = label;
    const v = document.createElement('strong'); v.textContent = column ? (rec[column] || '—') : 'Not mapped';
    if (!column) v.classList.add('muted-value'); item.append(k, v); area.appendChild(item);
  });
  $('previewRecord').textContent = csvRows.length > 1 ? 'Previewing data row 1' : 'No data row available';
}
function showSection(section) {
  activeSection = section;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.section === section));
  document.querySelectorAll('.page-section').forEach(s => s.hidden = s.id !== `section-${section}`);
  const titles = { workspace: 'Workspace', mapping: 'Data Mapping', layout: 'Auto UPS & Layout', output: 'Output & Costing' };
  $('pageTitle').textContent = titles[section] || 'Workspace';
  if (section === 'mapping') renderMapping();
  if (section === 'layout') toast('Layout engine is the next development phase; no production layout is generated yet.');
  if (section === 'output') toast('Production output and costing are not implemented yet.');
}

$('artButton').addEventListener('click', () => artFile.click());
$('artDrop').addEventListener('click', e => { if (e.target.id !== 'artButton') artFile.click(); });
artFile.addEventListener('change', () => {
  const file = artFile.files[0]; if (!file) return;
  $('artName').textContent = file.name; $('artStatus').textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
  $('artStatus').title = file.name; $('artDrop').querySelector('.file-symbol').textContent = file.name.split('.').pop().toUpperCase();
  toast('Artwork selected. Live AI/EPS/PDF editing and field placement are not connected yet.');
});
$('dataButton').addEventListener('click', () => dataFile.click());
$('dataDrop').addEventListener('click', e => { if (e.target.id !== 'dataButton') dataFile.click(); });
dataFile.addEventListener('change', async () => {
  const file = dataFile.files[0]; if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase(); setFileStatus(file);
  if (ext === 'csv') {
    csvRows = parseCSV(await file.text()); mappings = { SKU: '', Size: '', Price: '', Barcode: '', QR: '' };
    $('rowCount').textContent = `${Math.max(0, csvRows.length - 1)} records`;
    $('columnCount').textContent = `${headers().length} COLUMNS`; renderTable(csvRows); renderMapping();
    toast(`CSV imported: ${Math.max(0, csvRows.length - 1)} data rows.`);
  } else {
    csvRows = []; renderTable([]); $('rowCount').textContent = '0 records'; $('columnCount').textContent = '0 COLUMNS'; renderMapping();
    toast('This build reads CSV only. Save your Excel sheet as CSV UTF-8, then import it.');
  }
});
document.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener('change', () => {
  document.querySelectorAll('.mode-card').forEach(card => card.classList.toggle('selected', card.contains(input) && input.checked));
}));
document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => showSection(btn.dataset.section)));
$('continueButton').addEventListener('click', () => {
  if (!artFile.files.length) { toast('Please select a Master Tag artwork file first.'); return; }
  if (!dataFile.files.length) { toast('Please select a CSV data file first.'); return; }
  if (!csvRows.length) { toast('Import a valid CSV file first.'); return; }
  showSection('mapping'); toast('CSV import is ready. Map each data column to a field.');
});
$('addCustomField').addEventListener('click', () => {
  const input = $('customFieldName'), name = input.value.trim();
  if (!name) { toast('Enter a name for the custom field.'); return; }
  if (customFields.includes(name)) { toast('That custom field already exists.'); return; }
  customFields.push(name); mappings[`custom_${customFields.length - 1}`] = ''; input.value = ''; renderMapping(); toast(`Custom field added: ${name}`);
});
$('mappingBack').addEventListener('click', () => showSection('workspace'));
$('mappingSave').addEventListener('click', () => {
  const mapped = Object.values(mappings).filter(Boolean).length;
  toast(`${mapped} field mapping(s) configured for preview. Artwork merge/export is not implemented yet.`);
});
$('layoutBack').addEventListener('click', () => showSection('mapping'));
$('outputBack').addEventListener('click', () => showSection('layout'));
showSection('workspace');
