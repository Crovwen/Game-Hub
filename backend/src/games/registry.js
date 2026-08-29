'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// The one and only convention a new game must follow (spec section 27):
//   games/<id>/
//     manifest.json   — declares id, names, player counts, modes, engine file
//     engine.js        — exports a class with getInitialState/validateAction/
//                        applyAction/viewFor (see GameEngineBase.js for the
//                        documented contract; engines don't need to import it)
// Drop a new folder in here and it is picked up on the next server start —
// nothing anywhere else in Core has to change. There is no runtime
// filesystem-watching auto-reload (Render's free web service restarts on
// every deploy anyway), so "auto-discovery" means "discovered at startup",
// documented as a deliberate simplification for a single-instance deployment.

const GAMES_ROOT = path.join(__dirname, '..', '..', '..', 'games');

const REQUIRED_ENGINE_METHODS = ['getInitialState', 'validateAction', 'applyAction'];
const REQUIRED_MANIFEST_FIELDS = [
  'id', 'name', 'persianName', 'icon', 'description',
  'minPlayers', 'maxPlayers', 'supportedModes', 'supportedTypes', 'engine',
];

function validateManifest(manifest, folderName) {
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (manifest[field] === undefined) {
      throw new Error(`games/${folderName}/manifest.json is missing required field "${field}"`);
    }
  }
  if (manifest.id !== folderName) {
    throw new Error(`games/${folderName}/manifest.json id ("${manifest.id}") must match its folder name`);
  }
  if (manifest.minPlayers < 1 || manifest.maxPlayers < manifest.minPlayers) {
    throw new Error(`games/${folderName}/manifest.json has an invalid player count range`);
  }
}

function validateEngineShape(EngineClass, folderName) {
  const prototype = EngineClass.prototype || {};
  for (const method of REQUIRED_ENGINE_METHODS) {
    if (typeof prototype[method] !== 'function') {
      throw new Error(`games/${folderName}/engine.js's exported class is missing required method "${method}()"`);
    }
  }
}

/**
 * Scans GAMES_ROOT and returns a Map<gameId, { manifest, EngineClass }>.
 * Throws (loudly, at startup — not silently skipping) if a game folder is
 * malformed, because a half-broken game plugin should never make it into
 * a running deployment.
 */
function discoverGames() {
  const registry = new Map();

  if (!fs.existsSync(GAMES_ROOT)) {
    logger.warn('games_root_missing', { path: GAMES_ROOT });
    return registry;
  }

  const folders = fs
    .readdirSync(GAMES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const folderName of folders) {
    const manifestPath = path.join(GAMES_ROOT, folderName, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      logger.warn('game_folder_missing_manifest', { folder: folderName });
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    validateManifest(manifest, folderName);

    const enginePath = path.join(GAMES_ROOT, folderName, manifest.engine);
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const engineModule = require(enginePath);
    // Engines export { <ClassName>: class }. We take the first (and only
    // expected) export rather than forcing a specific export name, so a
    // plugin author can name their class whatever reads best.
    const EngineClass = Object.values(engineModule)[0];
    if (typeof EngineClass !== 'function') {
      throw new Error(`games/${folderName}/engine.js must export a class`);
    }
    validateEngineShape(EngineClass, folderName);

    registry.set(manifest.id, { manifest, EngineClass });
    logger.info('game_registered', { gameId: manifest.id, name: manifest.persianName });
  }

  return registry;
}

let cachedRegistry = null;

function getRegistry() {
  if (!cachedRegistry) cachedRegistry = discoverGames();
  return cachedRegistry;
}

function getManifests() {
  return Array.from(getRegistry().values()).map((entry) => entry.manifest);
}

function getGame(gameId) {
  const entry = getRegistry().get(gameId);
  if (!entry) throw new Error(`Unknown gameId: ${gameId}`);
  return entry;
}

function createEngine(gameId, matchConfig) {
  const { EngineClass } = getGame(gameId);
  return new EngineClass(matchConfig);
}

module.exports = { getRegistry, getManifests, getGame, createEngine, discoverGames };
