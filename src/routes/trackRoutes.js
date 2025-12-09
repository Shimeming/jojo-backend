import express from 'express';
import { mongoDb } from '../lib/db.js';

const router = express.Router();

router.post('/click', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        const collection = mongoDb.collection('click_events');

        const clickDocument = {
            userId: String(userId),
            timestamp: new Date(),
            eventType: 'click',
            trackingLabel: 'recommend_button_click',
        };

        await collection.insertOne(clickDocument);

        res.status(201).json({ success: true, message: 'Click tracked successfully.' });
    } catch (err) {
        console.error('Track Click Error:', err);
        res.status(500).json({ error: 'Failed to track click' });
    }
});

export default router;
