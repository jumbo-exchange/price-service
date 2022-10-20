import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class Pool {
  @PrimaryColumn({ unique: true })
  id: string;

  @Column()
  volume24hFirst: string;

  @Column()
  volume24hSecond: string;

  @Column()
  tokenFirst: string;

  @Column()
  tokenSecond: string;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @Column()
  volumeFirst: string;

  @Column()
  volumeSecond: string;
}
