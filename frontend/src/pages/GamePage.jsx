import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Skeleton } from '../components/Card';
import { BottomSheet } from '../components/BottomSheet';
import { useToast } from '../components/Toast';
import { useApp } from '../state/AppContext';
import { api } from '../services/api';
import { GAME_COMPONENTS } from '../games/registry';

const TYPE_OPTIONS = [
  { key: 'free', label: 'رایگان', icon: '🆓', desc: 'بدون شرط، فقط برای سرگرمی' },
  { key: 'staked', label: 'شرطی', icon: '🪙', desc: '۲۰۰ سکه شرط، برنده کل را می‌برد' },
];

const MODE_OPTIONS = [
  { key: 'random', label: 'رندوم', icon: '🎲', desc: 'با یک حریف تصادفی' },
  { key: 'friend', label: 'با دوست', icon: '👥', desc: 'یکی از دوستانتان را دعوت کنید' },
];

function SelectRow({ options, value, onChange, disabledKeys = [] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((opt) => {
        const disabled = disabledKeys.includes(opt.key);
        const selected = value === opt.key;
        return (
          <button
            key={opt.key}
            disabled={disabled}
            onClick={() => onChange(opt.key)}
            className={[
              'btn-press card-premium rounded-xl2 p-4 text-right disabled:opacity-30 disabled:cursor-not-allowed',
              selected ? 'border-turquoise shadow-glow' : '',
            ].join(' ')}
          >
            <div className="text-2xl mb-1">{opt.icon}</div>
            <div className="font-bold">{opt.label}</div>
            <div className="text-xs text-ink-dim mt-0.5">{opt.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

export default function GamePage() {
  const { user, refreshUser, socket } = useApp();
  const showToast = useToast();

  const [games, setGames] = useState(null);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [type, setType] = useState(null);
  const [mode, setMode] = useState(null);

  const [phase, setPhase] = useState('select'); // select | finding | friend_picker | friend_waiting | in_match
  const [friends, setFriends] = useState(null);
  const [invite, setInvite] = useState(null);

  const [activeMatch, setActiveMatch] = useState(null); // { matchId, gameId, state }
  const notificationPoll = useRef(null);

  useEffect(() => {
    api.games().then(setGames);
  }, []);

  // Resume an in-progress match on mount/reconnect (spec section 17).
  useEffect(() => {
    api.activeMatch().then(({ matchId }) => {
      if (matchId) joinMatch(matchId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    return socket.onMessage((message) => {
      if (message.type === 'state') {
        setActiveMatch((prev) => ({ matchId: message.matchId, gameId: message.gameId, state: message.state, presence: prev?.presence }));
        setPhase('in_match');
      } else if (message.type === 'presence') {
        setActiveMatch((prev) => (prev ? { ...prev, presence: message.presence } : prev));
      } else if (message.type === 'action_rejected') {
        showToast(message.error, 'error');
      } else if (message.type === 'match_finished') {
        const { result } = message;
        const iWon = result.winnerId === user?.id;
        if (result.draw) showToast('🤝 بازی مساوی شد', 'default');
        else showToast(iWon ? '🎉 شما برنده شدید!' : 'باختید. دفعه بعد موفق باشید', iWon ? 'success' : 'error');
        refreshUser();
        setActiveMatch(null);
        setPhase('select');
        setSelectedGameId(null);
        setType(null);
        setMode(null);
      }
    });
  }, [socket, user, showToast, refreshUser]);

  function joinMatch(matchId) {
    socket?.join(matchId);
    setPhase('in_match');
  }

  useEffect(() => {
    if (phase !== 'finding') {
      clearInterval(notificationPoll.current);
      return undefined;
    }
    notificationPoll.current = setInterval(async () => {
      const notes = await api.matchNotifications();
      for (const note of notes) {
        if (note.type === 'insufficient_funds') {
          showToast('🪙 موجودی کافی نیست', 'error');
          setPhase('select');
        } else if (note.type === 'matched') {
          joinMatch(note.matchId);
        }
      }
    }, 2000);
    return () => clearInterval(notificationPoll.current);
  }, [phase, showToast]);

  const startPlay = useCallback(async () => {
    if (type === 'staked' && user.coins < 200) {
      showToast(`🪙 موجودی کافی نیست (موجودی فعلی: ${new Intl.NumberFormat('fa-IR').format(user.coins)})`, 'error');
      return;
    }
    if (mode === 'random') {
      setPhase('finding');
      try {
        const result = await api.joinQueue(selectedGameId, type);
        if (result.status === 'matched') {
          joinMatch(result.matchId);
        }
        // else: stay in 'finding' — the WS 'state' message will land once matched.
      } catch (err) {
        showToast(err.message, 'error');
        setPhase('select');
      }
    } else {
      setPhase('friend_picker');
      const list = await api.friends();
      setFriends(list);
    }
  }, [type, mode, selectedGameId, user, showToast]);

  async function cancelFinding() {
    await api.leaveQueue();
    setPhase('select');
  }

  async function inviteFriend(friendId) {
    try {
      const request = await api.sendGameInvite(friendId, selectedGameId, type);
      setInvite(request);
      setPhase('friend_waiting');
      pollInvite(request.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function pollInvite(requestId) {
    const poll = setInterval(async () => {
      const { outgoing } = await api.listGameInvites();
      const stillPending = outgoing.some((r) => r.id === requestId);
      if (stillPending) return;
      clearInterval(poll);

      // The invite left the pending list either because our friend
      // accepted (a match now exists) or rejected/it expired. Check for
      // an active match rather than assuming — this is what moves the
      // *inviter's* screen into the match once the friend accepts,
      // mirroring how the invitee gets there via the bot's "ورود به بازی" button.
      const { matchId } = await api.activeMatch();
      if (matchId) {
        joinMatch(matchId);
      } else {
        showToast('دوست شما درخواست را رد کرد یا زمان آن تمام شد', 'error');
        setPhase('select');
      }
    }, 2000);
  }

  function sendAction(action) {
    socket?.sendAction(action);
  }

  if (phase === 'in_match' && activeMatch) {
    const game = games?.find((g) => g.id === activeMatch.gameId);
    const GameComponent = GAME_COMPONENTS[game?.frontendEntry || activeMatch.gameId];
    return (
      <div className="p-4">
        <Card className="mb-3 flex items-center justify-between">
          <span className="font-bold">
            {game?.icon} {game?.persianName || 'بازی'}
          </span>
          {activeMatch.presence && (
            <div className="flex gap-1">
              {activeMatch.presence.map((p) => (
                <span key={p.userId} className={`w-2 h-2 rounded-full ${p.connected ? 'bg-win' : 'bg-lose'}`} />
              ))}
            </div>
          )}
        </Card>
        {GameComponent ? (
          <GameComponent state={activeMatch.state} userId={user.id} onAction={sendAction} />
        ) : (
          <Card>این بازی هنوز رابط کاربری ندارد.</Card>
        )}
      </div>
    );
  }

  if (phase === 'finding') {
    return (
      <div className="p-4 flex flex-col items-center justify-center gap-4 pt-24">
        <div className="w-16 h-16 rounded-full border-4 border-turquoise/30 border-t-turquoise animate-spin" />
        <p className="text-ink-dim">در حال یافتن حریف...</p>
        <button onClick={cancelFinding} className="text-lose text-sm underline">
          انصراف
        </button>
      </div>
    );
  }

  if (phase === 'friend_waiting') {
    return (
      <div className="p-4 flex flex-col items-center justify-center gap-4 pt-24">
        <div className="text-4xl">⏳</div>
        <p className="text-ink-dim">منتظر پاسخ دوست شما هستیم...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      <div>
        <h2 className="font-bold mb-2 text-sm text-ink-dim">انتخاب بازی</h2>
        {!games ? (
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {games.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGameId(g.id)}
                className={[
                  'btn-press card-premium rounded-xl2 p-4 text-center',
                  selectedGameId === g.id ? 'border-turquoise shadow-glow' : '',
                ].join(' ')}
              >
                <div className="text-3xl mb-1">{g.icon}</div>
                <div className="font-bold text-sm">{g.persianName}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedGameId && (
        <div>
          <h2 className="font-bold mb-2 text-sm text-ink-dim">نوع بازی</h2>
          <SelectRow options={TYPE_OPTIONS} value={type} onChange={setType} />
        </div>
      )}

      {selectedGameId && type && (
        <div>
          <h2 className="font-bold mb-2 text-sm text-ink-dim">حالت بازی</h2>
          <SelectRow options={MODE_OPTIONS} value={mode} onChange={setMode} />
        </div>
      )}

      {selectedGameId && type && mode && (
        <button onClick={startPlay} className="btn-press w-full py-4 rounded-xl2 bg-turquoise text-bg font-extrabold text-lg shadow-glow">
          ▶️ Play
        </button>
      )}

      <BottomSheet open={phase === 'friend_picker'} onClose={() => setPhase('select')} title="یک دوست را انتخاب کنید">
        {!friends ? (
          <Skeleton className="h-12 mb-2" />
        ) : friends.length === 0 ? (
          <p className="text-ink-dim text-sm text-center py-6">هنوز دوستی اضافه نکرده‌اید.</p>
        ) : (
          <div className="space-y-2">
            {friends.map((f) => (
              <button
                key={f.id}
                onClick={() => inviteFriend(f.id)}
                className="btn-press w-full flex items-center gap-3 card-premium rounded-xl2 p-3 text-right"
              >
                <div className="w-10 h-10 rounded-full bg-bg-raised flex items-center justify-center">👤</div>
                <div className="font-bold">{f.firstName}</div>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
