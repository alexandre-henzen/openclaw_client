import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('agui_events')
@Index(['conversationId', 'runId', 'seq'])
export default class AguiEvent {
  @PrimaryGeneratedColumn()
  _id: number;

  @Column()
  conversationId: number;

  @Column({ type: 'text', nullable: true, default: null })
  runId: string | null;

  @Column({ type: 'integer' })
  seq: number;

  @Column({ type: 'text' })
  eventType: string;

  @Column({ type: 'simple-json' })
  eventJson: unknown;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  createdAt: Date;
}
