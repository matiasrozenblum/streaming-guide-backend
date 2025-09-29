-- Script to add new columns and populate background_color field with existing hardcoded values
-- This script replaces the need for TypeORM migrations

-- Add the new columns to the channel table
ALTER TABLE channel ADD COLUMN IF NOT EXISTS background_color TEXT;
ALTER TABLE channel ADD COLUMN IF NOT EXISTS show_only_when_scheduled BOOLEAN DEFAULT FALSE NOT NULL;

-- Update channels with their specific background colors based on the hardcoded mapping
UPDATE channel SET background_color = '#ffffff' WHERE LOWER(name) = 'luzu tv';
UPDATE channel SET background_color = '#181818' WHERE LOWER(name) = 'blender';
UPDATE channel SET background_color = '#0a0a09' WHERE LOWER(name) = 'vorterix';
UPDATE channel SET background_color = '#ffffff' WHERE LOWER(name) = 'olga';
UPDATE channel SET background_color = '#000000' WHERE LOWER(name) = 'gelatina';
UPDATE channel SET background_color = '#000000' WHERE LOWER(name) = 'urbana play';
UPDATE channel SET background_color = '#4a22d2' WHERE LOWER(name) = 'bondi live';
UPDATE channel SET background_color = 'linear-gradient(to bottom, #030917, #263A45)' WHERE LOWER(name) = 'la casa streaming';
UPDATE channel SET background_color = '#343732' WHERE LOWER(name) = 'un poco de ruido';
UPDATE channel SET background_color = '#ffffff' WHERE LOWER(name) = 'carajo';
UPDATE channel SET background_color = '#000000' WHERE LOWER(name) = 'republica z';
UPDATE channel SET background_color = '#76e8ab' WHERE LOWER(name) = 'futurock';
UPDATE channel SET background_color = '#091491' WHERE LOWER(name) = 'neura';
UPDATE channel SET background_color = '#013561' WHERE LOWER(name) = 'azz';
UPDATE channel SET background_color = '#ffffff' WHERE LOWER(name) = 'el trece';
UPDATE channel SET background_color = '#ffffff' WHERE LOWER(name) = 'carnaval';

-- Verify the updates
SELECT name, background_color FROM channel WHERE background_color IS NOT NULL ORDER BY name;
