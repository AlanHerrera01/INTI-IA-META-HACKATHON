fetch('/api/inventory',{cache:'no-store'}).then(response=>{
  if(!response.ok) throw new Error('Read-only application state unavailable');
  return response.json();
}).then(records=>{
  const body=document.querySelector('#records');
  for(const item of records){
    const row=document.createElement('tr');row.dataset.testid=`record-${item.id}`;
    for(const field of ['id','name','location','status','version']){
      const cell=document.createElement('td');cell.dataset.field=field;cell.textContent=String(item[field]);row.append(cell);
    }
    body.append(row);
  }
  document.querySelector('#notice').textContent='Persisted state loaded through the read-only interface.';
}).catch(error=>{document.querySelector('#notice').textContent=error.message;});
