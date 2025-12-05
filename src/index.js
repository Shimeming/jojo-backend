import express from 'express';
import { db } from './lib/db.js';
import { loadEnv } from './lib/env.js';

loadEnv();

const PORT = process.env.PORT || 3000;

const app = express();

app.get('/', (_req, res) => {
  res.send('DB backend is running');
});

app.get('/test', async (_req, res) => {
  try {
    const result = await db.manyOrNone(
      `
      SELECT *
      FROM test_table;
      `
    );
    res.json(result);
  } catch (err) {
    console.error('Error fetching the test table:', err);
    res.status(500).json({ error: 'Failed to fetch the test table' });
  }
});

app.get('/tables/:name', async (req, res) => {
  const tableName = req.params.name;
  try {
    const rows = await db.manyOrNone('SELECT * FROM $1:name LIMIT 100', [
      tableName,
    ]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching table rows:', err);
    res.status(500).json({ error: 'Failed to fetch table rows' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
