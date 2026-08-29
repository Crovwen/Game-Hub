import { useEffect, useState } from 'react';
import { Card, Skeleton } from '../components/Card';
import { CoinsPill, ScorePill } from '../components/StatPills';
import { useApp } from '../state/AppContext';
import { api } from '../services/api';

function StatBox({ label, value }) {
  return (
    <Card className="flex-1 text-center py-3">
      <div className="text-xl font-extrabold tabular">{value}</div>
      <div className="text-xs text-ink-dim mt-1">{label}</div>
    </Card>
  );
}

export default function Home() {
  const { user, refreshUser } = useApp();
  const [rank, setRank] = useState(null);

  useEffect(() => {
    refreshUser().then((me) => setRank(me.rank));
  }, [refreshUser]);

  if (!user) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  }

  const displayName = user.username ? `@${user.username}` : `${user.firstName} ${user.lastName || ''}`.trim();

  return (
    <div className="p-4 space-y-4">
      <Card glow className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-bg-raised flex items-center justify-center text-2xl shrink-0">
          {user.photoUrl ? <img src={user.photoUrl} alt="" className="w-full h-full object-cover" /> : '👤'}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-lg truncate">{user.firstName}</div>
          <div className="text-ink-dim text-sm truncate">{displayName}</div>
          {rank && <div className="text-xs text-turquoise mt-1">رتبه {new Intl.NumberFormat('fa-IR').format(rank)} در جدول امتیازات</div>}
        </div>
      </Card>

      <div className="flex gap-3">
        <CoinsPill value={user.coins} size="lg" />
        <ScorePill value={user.score} size="lg" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatBox label="برد" value={new Intl.NumberFormat('fa-IR').format(user.wins)} />
        <StatBox label="باخت" value={new Intl.NumberFormat('fa-IR').format(user.losses)} />
        <StatBox label="تعداد بازی" value={new Intl.NumberFormat('fa-IR').format(user.gamesPlayed)} />
      </div>

      <p className="text-center text-xs text-ink-faint pt-2">
        برای شروع یک بازی جدید به تب «بازی» بروید 🎮
      </p>
    </div>
  );
}
