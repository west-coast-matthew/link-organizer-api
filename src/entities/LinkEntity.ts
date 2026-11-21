import { createHash } from 'node:crypto'
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm'
import { LIMITS, type LinkItem, type Rating } from '../types'
import { CategoryEntity } from './CategoryEntity'

export const hashUrl = (url: string) => createHash('sha256').update(url).digest('hex')

/** A saved web link. */
@Entity({ name: 'links' })
export class LinkEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string

  @Column({ type: 'varchar', length: LIMITS.link.titleMaxLength })
  title: string

  @Column({ type: 'varchar', length: LIMITS.link.urlMaxLength })
  url: string

  /**
   * SHA-256 of url. A 2048-char utf8mb4 column is too wide for a unique index in
   * InnoDB, so uniqueness of url is enforced through this hash.
   */
  @Index('UQ_links_urlHash', { unique: true })
  @Column({ type: 'char', length: 64 })
  urlHash: string

  @Column({ type: 'text', nullable: true })
  description: string | null

  /** null = unsorted. Set to NULL if the category row disappears without the service moving the link. */
  @Index('IDX_links_categoryId')
  @Column({ type: 'char', length: 36, nullable: true })
  categoryId: string | null

  @ManyToOne(() => CategoryEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'categoryId', foreignKeyConstraintName: 'FK_links_categoryId' })
  category?: CategoryEntity | null

  /** 1–5 stars; null = not rated. */
  @Column({ type: 'tinyint', unsigned: true, nullable: true, default: null })
  rating: Rating | null

  @Index('IDX_links_createdAt')
  @CreateDateColumn({ type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date

  @UpdateDateColumn({ type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)', onUpdate: 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date

  @BeforeInsert()
  @BeforeUpdate()
  syncUrlHash() {
    if (this.url !== undefined) this.urlHash = hashUrl(this.url)
  }

  toJSON(): LinkItem {
    return {
      id: this.id,
      title: this.title,
      url: this.url,
      description: this.description,
      categoryId: this.categoryId,
      rating: this.rating,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    }
  }
}
