import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Card, Chip, Button, Spinner } from '../ui.jsx';

// Skills students are asking for that nobody teaches yet. Each row links to a prefilled "I can teach…" form.
export default function DemandCard({ compact = false }) {
  const [gaps, setGaps] = useState(null);
  useEffect(() => {
    api('/demand').then((d) => setGaps(d.gaps)).catch(() => setGaps([]));
  }, []);

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{compact ? 'Nobody teaches this yet' : 'Students are asking for…'}</h2>
        <Chip tone="clay">unmet</Chip>
      </div>
      {!compact && <p className="mb-2 text-sm text-mute">Know one of these? Be the first mentor and your sessions will fill quickly.</p>}
      {!gaps ? <Spinner /> : gaps.length === 0 ? (
        <p className="text-sm text-mute">Every request has a teacher right now. Nice work, campus.</p>
      ) : (
        <ul className="space-y-2.5">
          {gaps.slice(0, compact ? 4 : 6).map((g) => (
            <li key={g.title} className="flex items-center gap-3 border-b border-dashed border-line pb-2.5 last:border-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-tight">{g.title}</div>
                <div className="text-xs text-mute">{g.wanters} {g.wanters === 1 ? 'student wants' : 'students want'} it{g.mine ? ' · including you' : ''}</div>
              </div>
              <Link to={`/teach?offer=${encodeURIComponent(g.title)}&cat=${encodeURIComponent(g.category)}`}>
                <Button size="sm" variant="amber">Teach this</Button>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
