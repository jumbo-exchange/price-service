import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class Pool {
  @PrimaryColumn({ unique: true })
  id: string;

  @Column()
  volume24hIn: string;

  @Column()
  volume24hOut: string;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
