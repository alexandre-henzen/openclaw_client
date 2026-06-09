import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('gateway_profiles')
export default class GatewayProfile {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  gatewayUrl: string;

  @Column({ type: 'text' })
  clawgUiUrl: string;

  @Column({ type: 'text', nullable: true, default: null })
  wsUrl: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  clawgUiDeviceTokenEnc: string | null;

  @Column({ type: 'text', default: 'unpaired' })
  pairingStatus: string;

  @Column({ type: 'text', nullable: true, default: null })
  lastPairingCode: string | null;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  createdAt: Date;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  updatedAt: Date;
}
