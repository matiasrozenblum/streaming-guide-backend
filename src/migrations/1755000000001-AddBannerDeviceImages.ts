import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddBannerDeviceImages1755000000001 implements MigrationInterface {
  name = 'AddBannerDeviceImages1755000000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new nullable columns
    await queryRunner.addColumn(
      'banner',
      new TableColumn({
        name: 'image_url_desktop',
        type: 'text',
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      'banner',
      new TableColumn({
        name: 'image_url_mobile',
        type: 'text',
        isNullable: true,
      })
    );

    // Backfill: use legacy image_url for both if not set
    await queryRunner.query(`
      UPDATE "banner"
      SET image_url_desktop = COALESCE(image_url_desktop, image_url),
          image_url_mobile = COALESCE(image_url_mobile, image_url)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('banner', 'image_url_mobile');
    await queryRunner.dropColumn('banner', 'image_url_desktop');
  }
}

