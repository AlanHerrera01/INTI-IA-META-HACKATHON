let items = [];
let selected = null;
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
  document.querySelector('#record-save').textContent = `Save ${item.id}`;
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
    id.append(button); row.append(id);
    for (const field of ['name', 'location']) {
      const cell = document.createElement('td'); const input = document.createElement('input');
      input.value = item[field]; input.setAttribute('aria-label', `${item.id} ${field}`);
      input.oninput = () => { item[field] = input.value; }; cell.append(input); row.append(cell);
    }
    const cell = document.createElement('td'); const select = document.createElement('select');
    select.setAttribute('aria-label', `${item.id} table status`); options(select, item.status);
    select.onchange = () => { item.status = select.value; }; cell.append(select); row.append(cell); rows.append(row);
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
  } catch (error) { notice.textContent = error.message; }
  finally { button.disabled = false; }
};
document.querySelector('#save').onclick = async () => {
  const button = document.querySelector('#save'); button.disabled = true;
  try { const updated = []; for (const item of items) updated.push(await save(item)); items = updated; render(); notice.textContent = 'Inventory saved to the sandbox store.'; }
  catch (error) { notice.textContent = error.message; } finally { button.disabled = false; }
};
fetch('/api/inventory').then(response => { if (!response.ok) throw new Error('Inventory unavailable'); return response.json(); }).then(data => {items = data; render();}).catch(error => {notice.textContent = error.message;});
