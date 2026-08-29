import { useEffect, useState } from 'react';
import { Card, Skeleton } from '../components/Card';
import { useToast } from '../components/Toast';
import { api } from '../services/api';

export default function Friends() {
  const showToast = useToast();
  const [friends, setFriends] = useState(null);
  const [requests, setRequests] = useState(null);
  const [identifier, setIdentifier] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    const [f, r] = await Promise.all([api.friends(), api.friendRequests()]);
    setFriends(f);
    setRequests(r);
  }

  useEffect(() => {
    load();
  }, []);

  async function sendRequest() {
    if (!identifier.trim()) return;
    setSending(true);
    try {
      await api.sendFriendRequest(identifier.trim());
      showToast('درخواست دوستی ارسال شد ✅', 'success');
      setIdentifier('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  async function respond(id, accept) {
    try {
      await api.respondFriendRequest(id, accept);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div className="p-4 space-y-5">
      <Card>
        <h2 className="font-bold mb-2">افزودن دوست</h2>
        <div className="flex gap-2">
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="شناسه کاربر را وارد کنید"
            className="flex-1 bg-bg-raised rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-turquoise"
            dir="ltr"
            style={{ textAlign: 'right' }}
          />
          <button
            onClick={sendRequest}
            disabled={sending}
            className="btn-press px-4 rounded-xl bg-turquoise text-bg font-bold text-sm disabled:opacity-50"
          >
            ارسال درخواست
          </button>
        </div>
      </Card>

      {requests && requests.length > 0 && (
        <div>
          <h2 className="font-bold mb-2 text-sm text-ink-dim">درخواست‌های دریافتی</h2>
          <div className="space-y-2">
            {requests.map((r) => (
              <Card key={r.id} className="flex items-center justify-between">
                <span className="font-bold">{r.sender.firstName}</span>
                <div className="flex gap-2">
                  <button onClick={() => respond(r.id, true)} className="btn-press px-3 py-1.5 rounded-lg bg-win/20 text-win text-sm font-bold">
                    قبول
                  </button>
                  <button onClick={() => respond(r.id, false)} className="btn-press px-3 py-1.5 rounded-lg bg-lose/20 text-lose text-sm font-bold">
                    رد
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-bold mb-2 text-sm text-ink-dim">دوستان شما</h2>
        {!friends ? (
          <Skeleton className="h-14" />
        ) : friends.length === 0 ? (
          <p className="text-ink-dim text-sm text-center py-6">هنوز دوستی ندارید.</p>
        ) : (
          <div className="space-y-2">
            {friends.map((f) => (
              <Card key={f.id} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-bg-raised flex items-center justify-center">👤</div>
                <span className="font-bold">{f.firstName}</span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
