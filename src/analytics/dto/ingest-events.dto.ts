import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsEnum,
  IsObject,
  ValidateNested,
  ArrayMaxSize,
  ArrayNotEmpty,
  MaxLength,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum IngestPlatform {
  WEB = 'web',
  IOS = 'ios',
  ANDROID = 'android',
}

/** Hard ceiling per request; clients flush well below this. */
export const MAX_EVENTS_PER_BATCH = 50;

export class IngestEventDto {
  @IsString()
  @MaxLength(64)
  name: string;

  /** Client-side ISO timestamp of the action. */
  @IsISO8601()
  ts: string;

  @IsOptional()
  @IsInt()
  program_id?: number;

  @IsOptional()
  @IsInt()
  channel_id?: number;

  @IsOptional()
  @IsInt()
  streamer_id?: number;

  /**
   * Name fallbacks for clients that predate id-tagged events — notably mobile
   * builds already in the wild, which only ever sent program_name/channel_name.
   * The ingest service resolves these to ids so old installs still feed the
   * rankings. New clients should send ids and skip these entirely.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  program_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  channel_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  streamer_name?: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}

export class IngestEventsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  device_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  session_id?: string;

  @IsEnum(IngestPlatform)
  platform: IngestPlatform;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  app_version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  user_gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  user_age_group?: string;

  /**
   * Self-reported role. Only ever used to *drop* events (admins pollute the
   * metrics); it can never grant anything, so trusting the client is harmless.
   */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  user_role?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_EVENTS_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => IngestEventDto)
  events: IngestEventDto[];
}
