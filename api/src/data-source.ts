import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import path from 'path';
import fs from 'fs';
import {
  User,
  Agent,
  Conversation,
  Message,
  BlackList,
  GatewayProfile,
  AguiEvent,
  VisualArtifact,
  CopilotRun,
} from './entities';
import { BaselineSchema1780512000000 } from './migrations/1780512000000-BaselineSchema';

dotenv.config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'openclaw.sqlite');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: dbPath,
  synchronize: false,
  migrationsRun: true,
  migrations: [BaselineSchema1780512000000],
  entities: [
    User,
    Agent,
    Conversation,
    Message,
    BlackList,
    GatewayProfile,
    AguiEvent,
    VisualArtifact,
    CopilotRun,
  ],
});

export default AppDataSource;
