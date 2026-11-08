-- A Dot SVG Trace — larger uploads and more file types.
-- Applied automatically by the worker / check.php (StMigrate). Only changes
-- values that still equal the original defaults, so admin edits are kept.

UPDATE st_system_settings
   SET value_json = JSON_SET(value_json, '$.max_bytes', 1073741824), updated_at = UTC_TIMESTAMP()
 WHERE `key` = 'upload' AND JSON_EXTRACT(value_json, '$.max_bytes') = 20971520;

UPDATE st_system_settings
   SET value_json = JSON_SET(value_json, '$.max_dimension_px', 30000), updated_at = UTC_TIMESTAMP()
 WHERE `key` = 'upload' AND JSON_EXTRACT(value_json, '$.max_dimension_px') = 6000;

UPDATE st_system_settings
   SET value_json = JSON_SET(value_json, '$.allowed_formats', JSON_ARRAY()), updated_at = UTC_TIMESTAMP()
 WHERE `key` = 'upload'
   AND JSON_LENGTH(JSON_EXTRACT(value_json, '$.allowed_formats')) = 5
   AND JSON_CONTAINS(JSON_EXTRACT(value_json, '$.allowed_formats'), '["png","jpg","jpeg","bmp","webp"]');
