export function Status({ value, pending = false, yes = 'Available', no = 'Unavailable' }: {
  value: boolean | null | undefined; pending?: boolean; yes?: string; no?: string;
}) {
  const label = pending ? 'Checking' : value === true ? yes : value === false ? no : 'Unverified';
  return <span className={`status ${value === true ? 'good' : value === false ? 'muted' : 'unknown'}`}>
    <span className="status-dot" />{label}</span>;
}
