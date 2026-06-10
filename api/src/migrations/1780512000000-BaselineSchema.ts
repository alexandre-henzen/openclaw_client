import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLE_DDL = [
  `CREATE TABLE "agents" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "openclawAgentId" varchar NOT NULL DEFAULT ('main'), "createdBy" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime, "deletedAt" datetime, "costLimitDaily" real, "costLimitMonthly" real, "costLimitTotal" real)`,
  `CREATE TABLE "agui_events" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "conversationId" integer NOT NULL, "runId" text, "seq" integer NOT NULL, "eventType" text NOT NULL, "eventJson" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE "blacklist" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "hash" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE "conversations" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "agentId" integer NOT NULL, "title" text, "sessionKey" text, "threadId" text, "userScope" text, "copilotStatus" text NOT NULL DEFAULT ('idle'), "lastMessageAt" datetime, "createdBy" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "deletedAt" datetime)`,
  `CREATE TABLE "copilot_runs" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "conversationId" integer NOT NULL, "runId" text NOT NULL, "status" text NOT NULL DEFAULT ('started'), "startedAt" datetime NOT NULL DEFAULT (datetime('now')), "finishedAt" datetime, "errorJson" text)`,
  `CREATE TABLE "gateway_profiles" ("id" text PRIMARY KEY NOT NULL, "name" text NOT NULL, "gatewayUrl" text NOT NULL, "clawgUiUrl" text NOT NULL, "wsUrl" text, "clawgUiDeviceTokenEnc" text, "pairingStatus" text NOT NULL DEFAULT ('unpaired'), "lastPairingCode" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE "messages" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "conversationId" integer NOT NULL, "externalId" text, "text" text NOT NULL, "thinking" text, "files" text NOT NULL DEFAULT ('[]'), "toolSteps" text, "role" text NOT NULL DEFAULT ('user'), "createdBy" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "deletedAt" datetime)`,
  `CREATE TABLE "users" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "email" varchar NOT NULL, "password" varchar NOT NULL, "name" varchar NOT NULL, "lastName" varchar NOT NULL, "phone" text, "active" boolean NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime, "deletedAt" datetime, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`,
  `CREATE TABLE "visual_artifacts" ("_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "conversationId" integer NOT NULL, "runId" text, "artifactId" text NOT NULL, "protocol" text NOT NULL, "title" text, "mimeType" text, "resourceUri" text, "storageRef" text, "contentHash" text, "metadataJson" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
];

const INDEX_DDL = [
  `CREATE UNIQUE INDEX "IDX_087ee885d93610a1d0e02d831e" ON "copilot_runs" ("conversationId", "runId")`,
  `CREATE UNIQUE INDEX "IDX_4ac491e166c94df1ace85caede" ON "conversations" ("agentId", "sessionKey") WHERE sessionKey IS NOT NULL`,
  `CREATE INDEX "IDX_694ddf59eea3003f5ba64b4372" ON "agui_events" ("conversationId", "runId", "seq")`,
  `CREATE UNIQUE INDEX "IDX_803c0dbc387b43be48cedc9551" ON "messages" ("conversationId", "externalId") WHERE externalId IS NOT NULL`,
  `CREATE UNIQUE INDEX "IDX_d8227ee2f2a06fd3b76e4fd395" ON "visual_artifacts" ("conversationId", "artifactId")`,
];

export class BaselineSchema1780512000000 implements MigrationInterface {
  name = 'BaselineSchema1780512000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('users')) {
      return;
    }
    for (const ddl of TABLE_DDL) {
      await queryRunner.query(ddl);
    }
    for (const ddl of INDEX_DDL) {
      await queryRunner.query(ddl);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Baseline migration is not reversed in production installs.
  }
}
