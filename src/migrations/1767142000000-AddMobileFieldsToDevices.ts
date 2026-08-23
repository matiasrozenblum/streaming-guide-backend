import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMobileFieldsToDevices1767142000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add fcm_token column
    await queryRunner.addColumn(
      'devices',
      new TableColumn({
        name: 'fcm_token',
        type: 'text',
        isNullable: true,
        comment: 'Firebase Cloud Messaging token for push notifications',
      }),
    );

    // Add app_version column
    await queryRunner.addColumn(
      'devices',
      new TableColumn({
        name: 'app_version',
        type: 'text',
        isNullable: true,
        comment: 'Application version number',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('devices', 'app_version');
    await queryRunner.dropColumn('devices', 'fcm_token');
  }
}
