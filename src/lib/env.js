import dotenv from 'dotenv';

export function loadEnv() {
  if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ path: ['.env', '.env.example'], quiet: true });
  }
}
