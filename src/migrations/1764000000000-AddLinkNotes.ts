import type { MigrationInterface, QueryRunner } from 'typeorm'

/** Spec 003: optional rich text notes on links. MEDIUMTEXT because 20 000 utf8mb4 characters can exceed TEXT's 64 KB. */
export class AddLinkNotes1764000000000 implements MigrationInterface {
  name = 'AddLinkNotes1764000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `links` ADD `notes` mediumtext NULL AFTER `description`')
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `links` DROP COLUMN `notes`')
  }
}
