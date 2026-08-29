import { useMemo } from 'react';
import { Card } from '../../components/Card';
import { hapticImpact } from '../../telegram/webApp';

const RING_LENGTH = 52;
const COLOR_START_OFFSET = { red: 0, green: 13, yellow: 26, blue: 39 };
const COLOR_HEX = { red: '#FF5468', green: '#3DDC97', yellow: '#F5B841', blue: '#00C2B2' };
const SAFE_GLOBAL_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const CX = 150;
const CY = 150;
const RING_RX = 118;
const RING_RY = 118;
const HOME_COLUMN_STEPS = 6;

function ringPoint(globalPos) {
  const angle = (globalPos / RING_LENGTH) * 2 * Math.PI - Math.PI / 2;
  return { x: CX + RING_RX * Math.cos(angle), y: CY + RING_RY * Math.sin(angle) };
}

function globalPosition(color, step) {
  if (step > RING_LENGTH - 2) return null;
  return (COLOR_START_OFFSET[color] + step) % RING_LENGTH;
}

function homeColumnPoint(color, columnIndex) {
  // columnIndex: 0 (just entered) .. 5 (about to finish) -> interpolate from
  // the ring anchor toward the center.
  const anchorGlobalPos = (COLOR_START_OFFSET[color] + RING_LENGTH - 2) % RING_LENGTH; // step 50
  const anchor = ringPoint(anchorGlobalPos);
  const t = (columnIndex + 1) / (HOME_COLUMN_STEPS + 1);
  return { x: anchor.x + (CX - anchor.x) * t, y: anchor.y + (CY - anchor.y) * t };
}

function tokenPoint(color, step) {
  if (step <= RING_LENGTH - 2) return ringPoint(globalPosition(color, step));
  return homeColumnPoint(color, step - (RING_LENGTH - 1));
}

function yardAnchor(color) {
  const angle = (COLOR_START_OFFSET[color] / RING_LENGTH) * 2 * Math.PI - Math.PI / 2;
  const r = RING_RX + 40;
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

export default function LudoBoard({ state, userId, onAction }) {
  const me = state.players[userId];
  const isMyTurn = state.turnOrder[state.currentTurnIndex] === userId;
  const dice = state.dice;
  const legalTokenIds = state.pendingTokenIds || [];

  const ringSafeMarks = useMemo(() => Array.from(SAFE_GLOBAL_SQUARES).map(ringPoint), []);

  function handleRoll() {
    hapticImpact('light');
    onAction({ type: 'roll' });
  }

  function handleTokenClick(color, tokenId) {
    if (!isMyTurn || me.color !== color) return;
    if (!legalTokenIds.includes(tokenId)) return;
    hapticImpact('medium');
    onAction({ type: 'move', tokenId });
  }

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ background: COLOR_HEX[me.color] }} />
          <span className="text-sm text-ink-dim">مهره‌های شما</span>
        </div>
        <div
          className={[
            'w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-extrabold border-2',
            isMyTurn ? 'border-turquoise shadow-glow' : 'border-ink-faint/20 opacity-60',
          ].join(' ')}
        >
          {dice ?? '🎲'}
        </div>
      </Card>

      <div className="relative mx-auto" style={{ width: 300, height: 300 }}>
        <svg viewBox="0 0 300 300" className="w-full h-full">
          <circle cx={CX} cy={CY} r={RING_RX + 14} fill="none" stroke="#232C45" strokeWidth="26" />
          {Array.from({ length: RING_LENGTH }).map((_, i) => {
            const p = ringPoint(i);
            const colorAtStart = Object.entries(COLOR_START_OFFSET).find(([, off]) => off === i);
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={5.5}
                fill={colorAtStart ? COLOR_HEX[colorAtStart[0]] : '#131826'}
                stroke="#0B0F1A"
                strokeWidth="1"
              />
            );
          })}
          {ringSafeMarks.map((p, i) => (
            <text key={i} x={p.x} y={p.y + 3} fontSize="8" textAnchor="middle" fill="#E9EDF7" opacity="0.8">
              ★
            </text>
          ))}
          <circle cx={CX} cy={CY} r={26} fill="#1B2236" stroke="#00C2B2" strokeWidth="2" />

          {Object.entries(state.players).map(([pUserId, player]) =>
            player.tokens.map((token) => {
              if (token.pos === 'yard') return null;
              const p = tokenPoint(player.color, token.pos.step);
              const clickable = pUserId === userId && isMyTurn && legalTokenIds.includes(token.id);
              return (
                <g
                  key={`${pUserId}-${token.id}`}
                  onClick={() => handleTokenClick(player.color, token.id)}
                  style={{ cursor: clickable ? 'pointer' : 'default' }}
                >
                  {clickable && <circle cx={p.x} cy={p.y} r={11} fill="none" stroke={COLOR_HEX[player.color]} strokeWidth="2" opacity="0.6" />}
                  <circle cx={p.x} cy={p.y} r={7.5} fill={COLOR_HEX[player.color]} stroke="#0B0F1A" strokeWidth="1.5" />
                </g>
              );
            }),
          )}
        </svg>

        {Object.entries(state.players).map(([pUserId, player]) => {
          const anchor = yardAnchor(player.color);
          const yardTokens = player.tokens.filter((t) => t.pos === 'yard');
          if (yardTokens.length === 0) return null;
          return (
            <div
              key={pUserId}
              className="absolute flex gap-1 -translate-x-1/2 -translate-y-1/2"
              style={{ left: anchor.x, top: anchor.y }}
            >
              {yardTokens.map((t) => {
                const clickable = pUserId === userId && isMyTurn && legalTokenIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => handleTokenClick(player.color, t.id)}
                    className="w-4 h-4 rounded-full border border-bg btn-press"
                    style={{
                      background: COLOR_HEX[player.color],
                      boxShadow: clickable ? `0 0 0 3px ${COLOR_HEX[player.color]}55` : 'none',
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <button
        onClick={handleRoll}
        disabled={!isMyTurn || dice !== null}
        className="btn-press w-full py-3 rounded-xl2 bg-turquoise text-bg font-extrabold disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {isMyTurn ? (dice ? 'یک مهره را انتخاب کنید' : '🎲 ریختن تاس') : 'منتظر نوبت حریف...'}
      </button>
    </div>
  );
}
