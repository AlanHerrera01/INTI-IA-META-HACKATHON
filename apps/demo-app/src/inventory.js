let items = [];
let selected = null;
let uiState = {version: -1};
const statuses = ['Available', 'In use', 'Maintenance', 'Inactive', 'Operational'];
const notice = document.querySelector('#notice');
function options(select, current) {
  select.replaceChildren();
  for (const value of statuses) {
    const option = document.createElement('option');
    option.textContent = value; option.value = value; option.selected = current === value;
    select.append(option);
  }
}
async function save(item) {
  if (uiState.optimistic_only) return {...item, version: item.version + 1};
  const response = await fetch('/api/inventory', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(item)});
  if (!response.ok) throw new Error('Save failed. Reload the inventory before retrying.');
  return await response.json();
}
function open(item) {
  selected = {...item};
  document.querySelector('#asset-heading').textContent = `Asset ${item.id}`;
  document.querySelector('#asset-summary').textContent = `${item.name} · ${item.location}`;
  document.querySelector('#record-status').setAttribute('aria-label', `${item.id} status`);
  document.querySelector('#status-label').textContent = `${item.id} status`;
  document.querySelector('#record-save').textContent = uiState.save_label || `Save ${item.id}`;
  options(document.querySelector('#record-status'), item.status);
  document.querySelector('#asset-dialog').showModal();
}
function render() {
  const rows = document.querySelector('#records'); rows.replaceChildren();
  const query = document.querySelector('#search').value.toLowerCase();
  for (const item of items.filter(x => `${x.id} ${x.name}`.toLowerCase().includes(query))) {
    const row = document.createElement('tr');
    const id = document.createElement('td');
    const button = document.createElement('button'); button.textContent = `Open ${item.id}`;
    button.setAttribute('data-testid', `asset-${item.id}`); button.onclick = () => open(item);
    id.dataset.column = '0'; id.append(button); row.append(id);
    for (const field of ['name', 'location']) {
      const cell = document.createElement('td'); const input = document.createElement('input');
      cell.dataset.column = field === 'name' ? '1' : '2';
      input.value = item[field]; input.setAttribute('aria-label', `${item.id} ${field}`);
      input.oninput = () => { item[field] = input.value; }; cell.append(input); row.append(cell);
    }
    const cell = document.createElement('td'); const select = document.createElement('select');
    cell.dataset.column = '3';
    select.setAttribute('aria-label', `${item.id} table status`); options(select, item.status);
    select.onchange = () => { item.status = select.value; }; cell.append(select); row.append(cell); rows.append(row);
  }
  applyColumnOrder();
}

function applyColumnOrder() {
  const order = uiState.reorder_columns ? ['0','3','2','1'] : ['0','1','2','3'];
  for (const row of document.querySelectorAll('table tr')) {
    const cells = [...row.children];
    cells.forEach((cell,index) => {cell.dataset.column ??= String(index);});
    if(cells.length === 4) row.replaceChildren(...order.map(key => cells.find(cell => cell.dataset.column === key)));
  }
}
document.querySelector('#search').oninput = render;
document.querySelector('#record-close').onclick = () => document.querySelector('#asset-dialog').close();
document.querySelector('#record-save').onclick = async () => {
  const button = document.querySelector('#record-save'); button.disabled = true;
  try {
    selected.status = document.querySelector('#record-status').value;
    const saved = await save(selected);
    items = items.map(item => item.id === saved.id ? saved : item); selected = {...saved};
    notice.textContent = `Saved ${saved.id}: ${saved.status}`; render();
    document.querySelector('#asset-dialog').close();
  } catch (error) {
    if (uiState.optimistic_on_reject) {
      items = items.map(item => item.id === selected.id ? {...selected} : item);
      notice.textContent = `Saved ${selected.id}: ${selected.status}`;
      render(); document.querySelector('#asset-dialog').close();
    } else {notice.textContent = error.message;}
  }
  finally { button.disabled = false; }
};
document.querySelector('#save').onclick = async () => {
  const button = document.querySelector('#save'); button.disabled = true;
  try { const updated = []; for (const item of items) updated.push(await save(item)); items = updated; render(); notice.textContent = 'Inventory saved to the sandbox store.'; }
  catch (error) { notice.textContent = error.message; } finally { button.disabled = false; }
};
fetch('/api/inventory').then(response => { if (!response.ok) throw new Error('Inventory unavailable'); return response.json(); }).then(data => {items = data; render();}).catch(error => {notice.textContent = error.message;});

function applyVisibleState(state) {
  if (state.version === uiState.version) return;
  uiState = state;
  const version = state.version;
  const button = document.querySelector('#record-save');
  button.textContent = state.save_label || (selected ? `Save ${selected.id}` : 'Save');
  button.style.position = state.move_save ? 'relative' : '';
  button.style.left = state.move_save ? `${32 + state.seed % 24}px` : '';
  button.style.top = state.move_save ? '-20px' : '';
  button.style.visibility = state.render_delay_ms ? 'hidden' : '';
  button.disabled = !!state.disable_control_ms;
  if (state.render_delay_ms) setTimeout(() => {if (uiState.version === version) button.style.visibility = '';},state.render_delay_ms);
  if (state.disable_control_ms) setTimeout(() => {if (uiState.version === version) button.disabled = false;},state.disable_control_ms);
  document.querySelector('[data-ui-duplicate]')?.remove();
  if (state.duplicate_save) {
    const duplicate = button.cloneNode(true); duplicate.removeAttribute('id'); duplicate.dataset.uiDuplicate = 'true';
    button.after(duplicate);
  }
  const form = document.querySelector('#asset-dialog');
  const label = document.querySelector('#status-label');
  const control = document.querySelector('#record-status');
  const close = document.querySelector('#record-close');
  if (state.reorder_fields) form.append(button,close,label,control);
  else form.append(label,control,button,close);
  applyColumnOrder();
  document.querySelector('#interrupt-dialog')?.remove();
  if (state.modal) {
    const modal = document.createElement('dialog'); modal.id = 'interrupt-dialog'; modal.setAttribute('aria-label','Workspace notice');
    const heading = document.createElement('h2'); heading.textContent = 'Workspace notice';
    const text = document.createElement('p'); text.textContent = 'A workspace notice is covering the current form.';
    const dismiss = document.createElement('button'); dismiss.textContent = 'Dismiss notice'; dismiss.onclick = () => modal.close();
    modal.append(heading,text,dismiss); document.body.append(modal); modal.showModal();
  }
  if (state.navigation_path) history.pushState({},'',state.navigation_path);
}
async function refreshVisibleState() {
  try {const response = await fetch('/api/ui-state',{cache:'no-store'}); if(response.ok) applyVisibleState(await response.json());}
  catch { /* Fault control is optional; normal inventory remains usable. */ }
}
void refreshVisibleState();
setInterval(refreshVisibleState,1000);
