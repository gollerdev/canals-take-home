import {
  BeforeInsert,
  CreateDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { uuidV7 } from '../types/uuid-v7';

export abstract class AbstractEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  protected assignId(): void {
    this.id ??= uuidV7();
  }
}
