import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('visual_artifacts')
@Index(['conversationId', 'artifactId'], { unique: true })
export default class VisualArtifact {
  @PrimaryGeneratedColumn()
  _id: number;

  @Column()
  conversationId: number;

  @Column({ type: 'text', nullable: true, default: null })
  runId: string | null;

  @Column({ type: 'text' })
  artifactId: string;

  @Column({ type: 'text' })
  protocol: string;

  @Column({ type: 'text', nullable: true, default: null })
  title: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  mimeType: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  resourceUri: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  storageRef: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  contentHash: string | null;

  @Column({ type: 'simple-json', nullable: true, default: null })
  metadataJson: Record<string, unknown> | null;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  createdAt: Date;
}
