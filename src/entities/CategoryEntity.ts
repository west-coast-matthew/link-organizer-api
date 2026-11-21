import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { LIMITS, type Category } from '../types'

/**
 * A folder for links. Categories nest to any depth through parentId.
 * Deleting a category cascades to its subcategories at the database level; the
 * service moves the subtree's links to the deleted category's parent first.
 */
@Entity({ name: 'categories' })
export class CategoryEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string

  /** Unique among siblings, case-insensitive — enforced by the service. */
  @Column({ type: 'varchar', length: LIMITS.category.nameMaxLength })
  name: string

  @Index('IDX_categories_parentId')
  @Column({ type: 'char', length: 36, nullable: true })
  parentId: string | null

  @ManyToOne(() => CategoryEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parentId', foreignKeyConstraintName: 'FK_categories_parentId' })
  parent?: CategoryEntity | null

  @CreateDateColumn({ type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date

  @UpdateDateColumn({ type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)', onUpdate: 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date

  toJSON(): Category {
    return {
      id: this.id,
      name: this.name,
      parentId: this.parentId,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    }
  }
}
