import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLinkGroupIdToPrograms1782250703030
  implements MigrationInterface
{
  name = 'AddLinkGroupIdToPrograms1782250703030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "program" ADD "link_group_id" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "program" DROP COLUMN "link_group_id"`,
    );
  }
}
