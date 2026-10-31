import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddYoutubeLiveVideoIdToChannel1783200000000
  implements MigrationInterface
{
  name = 'AddYoutubeLiveVideoIdToChannel1783200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pins the videoId of a channel's permanent 24/7 broadcast. Those streams fall out
    // of YouTube's search index while still live (TN sat at 84k concurrent viewers with
    // search?eventType=live returning 0), so resolving them needs the id up front.
    // Nullable and self-populating: YoutubeLiveService fills it on first discovery.
    await queryRunner.query(
      `ALTER TABLE "channel" ADD "youtube_live_video_id" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "channel" DROP COLUMN IF EXISTS "youtube_live_video_id"`,
    );
  }
}
