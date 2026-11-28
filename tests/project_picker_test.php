<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/lib/public_project_picker.php';
function picker_expect(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('CREATE TABLE project_picker (id INTEGER PRIMARY KEY, catalog TEXT NOT NULL)');
$save = $db->prepare('INSERT OR REPLACE INTO project_picker(id,catalog) VALUES (1,?)');
$defaults = require __DIR__ . '/../app/data/quote-projects.php';
$questions = require __DIR__ . '/../app/data/quote-inquiry-questions.php';
foreach ($defaults as $id => $project) {
    if ($project['workflow'] !== 'inquiry') continue;
    picker_expect(isset($questions[$id]) && count($questions[$id]) >= 3, "Missing tailored inquiry questions for $id.");
    foreach ($questions[$id] as $field => $question) {
        picker_expect(in_array($field, ['dimensions','material','quantity','installation','finish'], true), "Unknown inquiry field $field.");
        picker_expect(count($question) === 2 && $question[0] !== '' && $question[1] !== '', "Missing label or example for $id/$field.");
    }
}
$save->execute([json_encode([
    ['id'=>'drawing','name'=>'My CNC','description'=>'Custom drawing'],
    ['id'=>'neon','name'=>'Neon','description'=>'Light','enabled'=>false],
    ['id'=>'picture','name'=>'Picture','description'=>'Trace'],
])]);
$items = quote_project_catalog($db);
picker_expect(array_key_first($items) === 'drawing' && $items['drawing']['name'] === 'My CNC', 'Saved order and labels must be preserved.');
picker_expect(!isset($items['neon']), 'Disabled projects must not reappear from defaults.');
picker_expect(isset($items['fiber']) && $items['fiber']['workflow'] === 'inquiry', 'Legacy catalogs must gain new inquiry categories.');
picker_expect($items['drawing']['workflow'] === 'drawing' && $items['picture']['workflow'] === 'picture', 'Existing projects must keep their current engines.');
$disabled = [];
foreach ($defaults as $id => $item) $disabled[] = ['id'=>$id,'name'=>$item['name'],'description'=>$item['description'],'enabled'=>false];
$save->execute([json_encode($disabled)]);
picker_expect(quote_project_catalog($db) === [], 'All projects can be disabled without being restored.');
$save->execute([json_encode([['id'=>'fiber','name'=>'Steel','description'=>'Review','workflow'=>'drawing']])]);
$items = quote_project_catalog($db);
picker_expect($items['fiber']['workflow'] === 'inquiry', 'Saved content must not change the trusted workflow.');
echo "Project picker checks passed.\n";
