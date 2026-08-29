import LudoBoard from './ludo/LudoBoard';
import GolYaPoochGame from './gol-ya-pooch/GolYaPoochGame';

// Keyed by manifest.frontendEntry (see games/<id>/manifest.json on the backend).
export const GAME_COMPONENTS = {
  ludo: LudoBoard,
  'gol-ya-pooch': GolYaPoochGame,
};
