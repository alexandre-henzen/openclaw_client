import { Entity, PrimaryGeneratedColumn, Column, DeleteDateColumn, Index } from 'typeorm';

@Entity('conversations')
@Index(['agentId', 'sessionKey'], { unique: true, where: 'sessionKey IS NOT NULL' })
export default class Conversation {
  @PrimaryGeneratedColumn()
  _id: number;

  @Column()
  agentId: number;

  @Column({ type: 'text', nullable: true, default: null })
  title: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  sessionKey: string | null;

  /** Stable AG-UI thread id (ULID). */
  @Column({ type: 'text', nullable: true, default: null })
  threadId: string | null;

  /** Trusted X-OpenClaw-Session-Key scope (server-side only). */
  @Column({ type: 'text', nullable: true, default: null })
  userScope: string | null;

  @Column({ type: 'text', default: 'idle' })
  copilotStatus: string;

  @Column({ type: 'datetime', nullable: true, default: null })
  lastMessageAt: Date | null;

  @Column()
  createdBy: number;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  createdAt: Date;

  @DeleteDateColumn({ type: 'datetime', nullable: true, default: null })
  deletedAt: Date | null;
}
