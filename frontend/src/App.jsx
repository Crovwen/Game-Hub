import { useState } from 'react';
import { useApp } from './state/AppContext';
import { BottomNav } from './layouts/BottomNav';
import Home from './pages/Home';
import GamePage from './pages/GamePage';
import Players from './pages/Players';
import Friends from './pages/Friends';
import Profile from './pages/Profile';

const PAGES = {
  home: Home,
  game: GamePage,
  players: Players,
  friends: Friends,
  profile: Profile,
};

export default function App() {
  const { status, error } = useApp();
  const [tab, setTab] = useState('home');

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-full border-4 border-turquoise/30 border-t-turquoise animate-spin" />
        <p className="text-ink-dim text-sm">در حال اتصال...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="text-4xl">⚠️</div>
        <p className="text-ink-dim">{error}</p>
      </div>
    );
  }

  const Page = PAGES[tab];

  return (
    <div className="min-h-screen pb-28">
      <Page />
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
