import { PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export class Token {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint', default: true })
  decimals: number;

  @Column({ type: 'varchar', length: 30 })
  symbol: string;

  @Column({ type: 'varchar', length: 300 })
  price: string;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
