import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BrainCircuit, Expand, LoaderCircle, ScanLine } from 'lucide-react';
import { api, errorMessage } from '../../services/api';
import { useModel } from '../../hooks/useSystem';
import type { Observation } from '../../types/api';

export function ObservationViewer({ observation }: { observation?: Observation }) {
  const [instruction, setInstruction] = useState('Identify the visible controls and describe the inventory state.');
  const [imageError, setImageError] = useState(false);
  const model = useModel(); const client = useQueryClient();
  const analysis = useMutation({
    mutationFn: () => api.analyze(observation!.id, instruction),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['observations'] }); },
    onSettled: async () => { await client.invalidateQueries({ queryKey: ['model'] }); },
  });
  if (!observation) return <div className="empty-state"><div className="scan-symbol"><ScanLine size={42} /></div>
    <h3>Your first observation starts here</h3><p>Capture the local inventory sandbox to see what INTI sees.<br />A real screenshot. A persistent record. A foundation for reasoning.</p>
    <span className="mono">AWAITING VISUAL INPUT</span></div>;
  return <div className="viewer"><div className="screenshot-frame"><div className="browser-bar"><span className="traffic">● ● ●</span><span>{observation.page_title}</span>
    <a aria-label="Open screenshot" href={observation.screenshot_url} target="_blank" rel="noreferrer"><Expand size={15} /></a></div>
    {imageError ? <p className="error" role="alert">Screenshot could not be loaded.</p> : <img alt={`Captured ${observation.page_title}`} src={observation.screenshot_url} onError={() => setImageError(true)} />}
  </div><div className="observation-details"><div className="section-label">OBSERVATION METADATA</div><dl>
    <div><dt>Observation ID</dt><dd className="mono">{observation.id}</dd></div>
    <div><dt>Captured at</dt><dd>{new Date(observation.timestamp).toLocaleString()}</dd></div>
    <div><dt>Viewport</dt><dd>{observation.width} × {observation.height}</dd></div>
    <div><dt>Source URL</dt><dd className="mono">{observation.source_url}</dd></div>
    <div><dt>Page title</dt><dd>{observation.page_title}</dd></div>
  </dl><label htmlFor="instruction" className="section-label">MODEL INSTRUCTION</label>
    <textarea id="instruction" maxLength={2000} value={instruction} onChange={event => setInstruction(event.target.value)} />
    <button className="button secondary" disabled={!model.data?.configured || analysis.isPending || !instruction.trim()} onClick={() => analysis.mutate()}>
      {analysis.isPending ? <LoaderCircle className="spin" size={16} /> : <BrainCircuit size={16} />} {analysis.isPending ? 'Interpreting screenshot…' : 'Analyze with Meta'}</button>
    {!model.data?.configured && <p className="hint">Configure a Meta API key to enable real model interpretation.</p>}
    {analysis.isError && <p className="error" role="alert">{errorMessage(analysis.error)}</p>}
    {(analysis.data ?? observation.analysis) && (() => { const result = analysis.data ?? observation.analysis!; return <section className="analysis" aria-label="Model analysis"><div className="section-label">META INTERPRETATION</div><h3>{result.model}</h3><p>{result.summary}</p><h4>Visible elements</h4><ul>{result.elements.map((element, index) => <li key={index}>{element}</li>)}</ul><h4>UI state</h4><p>{result.ui_state}</p></section>; })()}
  </div></div>;
}
