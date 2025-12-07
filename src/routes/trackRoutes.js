import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { mongoDb } from '../lib/db.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serve a simple page with a button
router.get('/track', (_req, res) => {
  const htmlPath = path.resolve(__dirname, '../public/track.html');
  res.sendFile(htmlPath);
});

// API to record clicks into MongoDB (db: jojo)
router.post('/api/track', async (req, res) => {
  try {
    const { userId, trackingLabel, elementId } = req.body || {};
    if (!userId || !trackingLabel) {
      return res.status(400).json({ error: 'userId and trackingLabel are required' });
    }
    const doc = {
      userId: String(userId),
      timestamp: new Date(),
      eventType: 'click',
      trackingLabel: String(trackingLabel),
      ...(elementId ? { elementId: String(elementId) } : {}),
    };
    const collection = mongoDb.collection('click_events');
    const result = await collection.insertOne(doc);
    res.json({ success: true, id: result.insertedId });
  } catch (err) {
    console.error('Track insert error:', err);
    res.status(500).json({ error: 'Failed to insert track event' });
  }
});

export default router;
