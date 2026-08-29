import { Card, Skeleton } from '../components/Card';
import { CoinsPill, ScorePill } from '../components/StatPills';
import { useApp } from '../state/AppContext';

export default function Profile() {
  const { user } = useApp();

  if (!user) return <div className="p-4"><Skeleton className="h-40" /></div>;

  const rows = [
    { label: 'برد', value: user.wins },
    { label: 'باخت', value: user.losses },
    { label: 'تعداد بازی', value: user.gamesPlayed },
  ];

  return (
    <div className="p-4 space-y-4">
      <Card glow className="flex flex-col items-center text-center py-6">
        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-bg-raised flex items-center justify-center text-3xl mb-3">
          {user.photoUrl ? <img src={user.photoUrl} alt="" className="w-full h-full object-cover" /> : '👤'}
        </div>
        <div className="font-extrabold text-lg">{user.firstName} {user.lastName || ''}</div>
        {user.username && <div className="text-ink-dim text-sm">@{user.username}</div>}
        <div className="flex gap-3 mt-4">
          <CoinsPill value={user.coins} />
          <ScorePill value={user.score} />
        </div>
      </Card>

      <Card>
        {rows.map((r, i) => (
          <div key={r.label} className={`flex justify-between py-2.5 ${i > 0 ? 'border-t border-white/5' : ''}`}>
            <span className="text-ink-dim text-sm">{r.label}</span>
            <span className="font-bold tabular">{new Intl.NumberFormat('fa-IR').format(r.value)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
