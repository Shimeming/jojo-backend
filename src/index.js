import express from 'express';
import pgPromise from 'pg-promise';
import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: ['.env', '.env.example'], quiet: true });
}

const PORT = process.env.PORT;

const pgp = pgPromise({});
const db = pgp({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB_NAME,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

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
