import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('copilot_runs')
@Index(['conversationId', 'runId'], { unique: true })
export default class CopilotRun {
  @PrimaryGeneratedColumn()
  _id: number;

  @Column()
  conversationId: number;

  @Column({ type: 'text' })
  runId: string;

  @Column({ type: 'text', default: 'started' })
  status: string;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  finishedAt: Date | null;

  @Column({ type: 'simple-json', nullable: true, default: null })
  errorJson: unknown | null;
}
