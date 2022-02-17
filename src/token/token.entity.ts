import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
@Entity()
export class Token {
  @PrimaryColumn({ unique: true })
  id: string;

  @Column()
  decimal: number;

  @Column()
  symbol: string;

  @Column()
  price: string;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
