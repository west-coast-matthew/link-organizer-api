import type { MigrationInterface, QueryRunner } from 'typeorm'

export class InitialSchema1763740800000 implements MigrationInterface {
  name = 'InitialSchema1763740800000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`categories\` (
        \`id\` char(36) NOT NULL,
        \`name\` varchar(80) NOT NULL,
        \`parentId\` char(36) NULL,
        \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`IDX_categories_parentId\` (\`parentId\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE \`links\` (
        \`id\` char(36) NOT NULL,
        \`title\` varchar(200) NOT NULL,
        \`url\` varchar(2048) NOT NULL,
        \`urlHash\` char(64) NOT NULL,
        \`description\` text NULL,
        \`categoryId\` char(36) NULL,
        \`rating\` tinyint UNSIGNED NULL DEFAULT NULL,
        \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`UQ_links_urlHash\` (\`urlHash\`),
        INDEX \`IDX_links_categoryId\` (\`categoryId\`),
        INDEX \`IDX_links_createdAt\` (\`createdAt\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(
      'ALTER TABLE `categories` ADD CONSTRAINT `FK_categories_parentId` FOREIGN KEY (`parentId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    )
    await queryRunner.query(
      'ALTER TABLE `links` ADD CONSTRAINT `FK_links_categoryId` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `links` DROP FOREIGN KEY `FK_links_categoryId`')
    await queryRunner.query('ALTER TABLE `categories` DROP FOREIGN KEY `FK_categories_parentId`')
    await queryRunner.query('DROP TABLE `links`')
    await queryRunner.query('DROP TABLE `categories`')
  }
}
