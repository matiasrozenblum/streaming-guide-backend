import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPlatformToDevices1767141000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'devices',
      new TableColumn({
        name: 'platform',
        type: 'varchar',
        isNullable: true,
        comment: 'Platform type: ios, android, or web',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('devices', 'platform');
  }
}
