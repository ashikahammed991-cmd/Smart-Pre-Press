const $ = (id) => document.getElementById(id);
const artFile = $('artFile');
const dataFile = $('dataFile');
let csvRows = [];

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
}

$('artButton').addEventListener('click', () => artFile.click());
$('artDrop').addEventListener('click', e => { if (e.target.id !== 'artButton') artFile.click(); });
artFile.addEventListener('change', () => {
  const file = artFile.files[0];
  if (!file) return;
  $('artName').textContent = file.name;
  $('artStatus').textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
  $('artStatus').title = file.name;
  const ext = file.name.split('.').pop().toUpperCase();
  $('artDrop').querySelector('.file-symbol').textContent = ext;
  toast('Artwork selected. Full artwork preview/editing will be added in a later build.');
});

$('dataButton').addEventListener('click', () => dataFile.click());
$('dataDrop').addEventListener('click', e => { if (e.target.id !== 'dataButton') dataFile.click(); });
dataFile.addEventListener('change', async () => {
  const file = dataFile.files[0];
  if (!file) return;
  $('dataName').textContent = file.name;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const text = await file.text();
    csvRows = parseCSV(text);
    renderTable(csvRows);
    $('rowCount').textContent = `${Math.max(0, csvRows.length - 1)} records`;
    $('columnCount').textContent = `${(csvRows[0] || []).length} COLUMNS`;
    $('dataDrop').querySelector('.file-symbol').textContent = 'CSV';
    toast(`CSV imported: ${Math.max(0, csvRows.length - 1)} data rows.`);
  } else {
    csvRows = [];
    renderTable([]);
    $('rowCount').textContent = '0 records';
    $('columnCount').textContent = '0 COLUMNS';
    toast('XLSX/XLS selected. Spreadsheet parsing is not yet connected in this starter; CSV works now.');
  }
});

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"' && quoted && next === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && next === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

function renderTable(rows) {
  const head = $('tableHead'), body = $('tableBody');
  head.replaceChildren(); body.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.className = 'empty'; td.textContent = 'Your data preview will appear here.';
    tr.appendChild(td); body.appendChild(tr); return;
  }
  const hr = document.createElement('tr');
  rows[0].forEach(value => { const th = document.createElement('th'); th.textContent = value || '(blank header)'; hr.appendChild(th); });
  head.appendChild(hr);
  rows.slice(1, 7).forEach(row => {
    const tr = document.createElement('tr');
    rows[0].forEach((_, i) => { const td = document.createElement('td'); td.textContent = row[i] || ''; tr.appendChild(td); });
    body.appendChild(tr);
  });
}

document.querySelectorAll('input[name="mode"]').forEach(input => {
  input.addEventListener('change', () => {
    document.querySelectorAll('.mode-card').forEach(card => card.classList.toggle('selected', card.contains(input) && input.checked));
  });
});

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
    const section = btn.dataset.section;
    const titles = {workspace:'Workspace', mapping:'Data Mapping', layout:'Auto UPS & Layout', output:'Output & Costing'};
    $('pageTitle').textContent = titles[section] || 'Workspace';
    if (section !== 'workspace') toast(`${titles[section]} is planned for the next development step.`);
  });
});

$('continueButton').addEventListener('click', () => {
  if (!artFile.files.length) { toast('Please select a Master Tag artwork file first.'); return; }
  if (!dataFile.files.length) { toast('Please select a CSV data file first.'); return; }
  if (!csvRows.length) { toast('For this starter, import CSV data. XLSX support will be added next.'); return; }
  toast('Import stage complete. Next step: implement field mapping and live merge preview.');
});
