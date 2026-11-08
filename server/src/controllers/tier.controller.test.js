jest.mock('../services/tier.service', () => ({
  listTiers: jest.fn(),
  addTier: jest.fn(),
  updateTier: jest.fn(),
  removeTier: jest.fn(),
}));

const tierService = require('../services/tier.service');
const { addTier, updateTier } = require('./tier.controller');

function createResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Tier controller request defaults', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses an empty body when adding a tier without one', async () => {
    const tier = { id: 'TIER-1' };
    tierService.addTier.mockResolvedValue(tier);
    const res = createResponse();

    await addTier({ params: { id: 'EVT-1' }, user: { userId: 'USR-1' } }, res);

    expect(tierService.addTier).toHaveBeenCalledWith('EVT-1', {}, { userId: 'USR-1' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', tier });
  });

  test('uses an empty body when updating a tier without one', async () => {
    const tier = { id: 'TIER-1' };
    tierService.updateTier.mockResolvedValue(tier);
    const res = createResponse();

    await updateTier({
      params: { id: 'EVT-1', tierId: 'TIER-1' },
      user: { userId: 'USR-1' },
    }, res);

    expect(tierService.updateTier).toHaveBeenCalledWith(
      'EVT-1',
      'TIER-1',
      {},
      { userId: 'USR-1' }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', tier });
  });
});
