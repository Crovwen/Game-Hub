import { useEffect, useState } from 'react';
import { Card, Skeleton } from '../components/Card';
import { api } from '../services/api';

const MEDALS = ['🥇', '🥈', '🥉'];
const fmt = (n) => new Intl.NumberFormat('fa-IR').format(n ?? 0);

export default function Players() {
  const [players, setPlayers] = useState(null);

  useEffect(() => {
    api.leaderboard().then(setPlayers);
  }, []);

  return (
    <div className="p-4 space-y-3">
      <h1 className="font-extrabold text-lg mb-1">🏆 برترین بازیکنان</h1>
      {!players
        ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)
        : players.map((p) => (
            <Card key={p.id} className="flex items-center gap-3">
              <div className="w-9 text-center text-lg font-extrabold shrink-0">
                {MEDALS[p.rank - 1] || <span className="text-ink-dim text-sm">{fmt(p.rank)}</span>}
              </div>
              <div className="w-10 h-10 rounded-full bg-bg-raised flex items-center justify-center shrink-0 overflow-hidden">
                {p.photoUrl ? <img src={p.photoUrl} alt="" className="w-full h-full object-cover" /> : '👤'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{p.firstName} {p.lastName || ''}</div>
                <div className="text-xs text-ink-dim truncate">{p.username ? `@${p.username}` : ''}</div>
              </div>
              <div className="text-left shrink-0 space-y-0.5">
                <div className="text-turquoise font-bold text-sm tabular">⭐ {fmt(p.score)}</div>
                <div className="text-gold text-xs tabular">🪙 {fmt(p.coins)}</div>
              </div>
            </Card>
          ))}
    </div>
  );
}
