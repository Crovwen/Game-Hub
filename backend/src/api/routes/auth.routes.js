'use strict';

const express = require('express');
const { loginWithTelegram } = require('../../auth/middleware');

const router = express.Router();

router.post('/telegram', loginWithTelegram);

module.exports = router;
