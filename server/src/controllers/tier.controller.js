const tierService = require('../services/tier.service');
const { sendError } = require('./event.controller');

async function listTiers(req, res) {
  try {
    const tiers = await tierService.listTiers(req.params.id, req.user);
    return res.status(200).json({ status: 'success', tiers });
  } catch (err) {
    return sendError(res, err);
  }
}

async function addTier(req, res) {
  try {
    const tier = await tierService.addTier(req.params.id, req.body || {}, req.user);
    return res.status(201).json({ status: 'success', tier });
  } catch (err) {
    return sendError(res, err);
  }
}

async function updateTier(req, res) {
  try {
    const tier = await tierService.updateTier(req.params.id, req.params.tierId, req.body || {}, req.user);
    return res.status(200).json({ status: 'success', tier });
  } catch (err) {
    return sendError(res, err);
  }
}

async function removeTier(req, res) {
  try {
    await tierService.removeTier(req.params.id, req.params.tierId, req.user);
    return res.status(204).send();
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { listTiers, addTier, updateTier, removeTier };
