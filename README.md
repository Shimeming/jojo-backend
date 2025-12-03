- use [nvm](https://github.com/nvm-sh/nvm) to set the node version to 24.11.1
  ```
  nvm install 24.11.1
  nvm use 24.11.1
  ```
- install tools:
  ```
  npm install -g pnpm
  npm install -g nodemon
  ```
- use `pnpm i` to install dependencies
Use
```
docker compose up
```
to start the db server.
The db server will be running on port 23013, and the backend will be running on port 3010.
The password of the db server is `dbfinal`.
and store its data in the `db/data/` folder.

Use
```
pnpm run dev
```
to start the backend server in development mode.

To test functionality, you can use
```sql
CREATE TABLE IF NOT EXISTS test_table (id SERIAL PRIMARY KEY, name TEXT);
INSERT INTO test_table (name) VALUES ('test_name');
SELECT * FROM test_table;
```
to create a test table, insert a row, and query the row.

Then go to `localhost:3000/test` to see if the backend server can connect to the db server successfully.
