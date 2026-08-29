import { Card } from '../../components/Card';
import { hapticImpact } from '../../telegram/webApp';

function Fist({ onClick, disabled, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn-press flex-1 aspect-square rounded-xl2 card-premium flex flex-col items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span className="text-5xl">✊</span>
      <span className="text-xs text-ink-dim">{label}</span>
    </button>
  );
}

export default function GolYaPoochGame({ state, userId, onAction }) {
  const round = state.currentRound;
  const iAmHolder = round.holderId === userId;
  const iAmGuesser = round.guesserId === userId;
  const holderHasHidden = round.pendingHolderChoice !== null;

  function act(type, hand) {
    hapticImpact('medium');
    onAction({ type, hand });
  }

  let prompt;
  let fistsDisabled = true;
  let onFistClick = () => {};

  if (iAmHolder && !holderHasHidden) {
    prompt = 'گل را در کدام دست پنهان می‌کنید؟';
    fistsDisabled = false;
    onFistClick = (hand) => act('hide', hand);
  } else if (iAmHolder && holderHasHidden) {
    prompt = '⏳ منتظر حدس حریف...';
  } else if (iAmGuesser && holderHasHidden) {
    prompt = 'گل کدام مشت است؟';
    fistsDisabled = false;
    onFistClick = (hand) => act('guess', hand);
  } else {
    prompt = '⏳ منتظر انتخاب حریف...';
  }

  const otherUserId = state.order.find((id) => id !== userId);

  return (
    <div className="space-y-4">
      <Card className="text-center">
        <div className="text-xs text-ink-dim mb-1">
          دور {new Intl.NumberFormat('fa-IR').format(round.roundNumber)} · فرصت {new Intl.NumberFormat('fa-IR').format(round.attemptIndex + 1)} از{' '}
          {new Intl.NumberFormat('fa-IR').format(round.attemptsPerTurn)}
        </div>
        <div className="font-bold">{prompt}</div>
      </Card>

      <div className="flex gap-3">
        <Fist onClick={() => onFistClick('left')} disabled={fistsDisabled} label="مشت چپ" />
        <Fist onClick={() => onFistClick('right')} disabled={fistsDisabled} label="مشت راست" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="text-center">
          <div className="text-xs text-ink-dim">امتیاز شما</div>
          <div className="text-2xl font-extrabold tabular text-turquoise">{state.players[userId].totalCorrect}</div>
        </Card>
        <Card className="text-center">
          <div className="text-xs text-ink-dim">امتیاز حریف</div>
          <div className="text-2xl font-extrabold tabular text-ink-dim">{state.players[otherUserId]?.totalCorrect ?? 0}</div>
        </Card>
      </div>
    </div>
  );
}
