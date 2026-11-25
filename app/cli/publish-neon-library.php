<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
require_once dirname(__DIR__) . '/lib/neon.php';
neon_publish_library(neon_db());
