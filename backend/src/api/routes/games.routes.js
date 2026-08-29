'use strict';

const express = require('express');
const registry = require('../../games/registry');
const { requireAuth } = require('../../auth/middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const manifests = registry.getManifests();
  res.json(
    manifests.map((m) => ({
      id: m.id,
      name: m.name,
      persianName: m.persianName,
      icon: m.icon,
      description: m.description,
      minPlayers: m.minPlayers,
      maxPlayers: m.maxPlayers,
      supportedModes: m.supportedModes,
      supportedTypes: m.supportedTypes,
      frontendEntry: m.frontendEntry,
      theme: m.theme || null,
    })),
  );
});

module.exports = router;
