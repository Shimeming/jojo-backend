# DB Final Project - Backend

This project serves as the backend for the DB Final Project,
providing API endpoints and managing data with PostgreSQL and MongoDB.
## Table of Contents
- [Installation](#installation)
- [Running-the-App](#running-the-app)
- [Database Management](#database-management)
- [Data Seeding](#data-seeding)

## Installation

### Node.js Version
It is recommended to use [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager) to manage your Node.js versions.
```bash
nvm install 24.11.1
nvm use 24.11.1
```

### Global Tools
Install `pnpm` and `nodemon` globally:
```bash
npm install -g pnpm
npm install -g nodemon
```

### Dependencies
Install project dependencies using pnpm:
```bash
pnpm i
```

## Running the App

### Start Database Servers
Use Docker Compose to start the PostgreSQL and MongoDB database servers:
```bash
docker compose up
```
-   PostgreSQL will be running on port `23013`.
-   MongoDB will be running on port `27017`.
-   The database password is `dbfinal`.
-   Database data will be stored in the `db/data/` directory.

### Interact with MongoDB Shell
You can interact with the MongoDB server using `mongosh`:
```bash
mongosh "mongodb://root:dbfinal@localhost:27017/?authSource=admin"
```

### Start Backend Server (Development)
To run the backend server in development mode with live reloading:
```bash
pnpm run dev
```
The backend server will be running on port `3010`.

### Start Backend Server
To run the backend server in production mode:
```bash
pnpm start
```

## Data Seeding

To clear existing data and seed the database with initial data:
```bash
pnpm run seed --clear-and-generate
```

### Data Sources
- **User Data**:
  - Number of people in departments: [NTU Academic Affairs Office](https://www.aca.ntu.edu.tw/WebUPD/aca/UAADStatistics/113%E4%B8%8B%E5%AD%B8%E6%9C%9F%E5%AD%B8%E7%94%9F%E4%BA%BA%E6%95%B8%E7%B5%B1%E8%A8%88%E8%A1%A8.pdf)
- **ent Data**:
  - Meetup events: [Kaggle Meetup Dataset](https://www.kaggle.com/datasets/megelon/meetup)
  <!-- - Event attendance: [Kaggle Event Attendance Dataset](https://www.kaggle.com/datasets/cankatsrc/event-attendance-dataset) -->
