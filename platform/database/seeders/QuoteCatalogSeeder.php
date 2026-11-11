<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class QuoteCatalogSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        $machines = [
            ['name' => 'CO2 Laser', 'code' => 'co2', 'setup_minutes' => 12, 'setup_cost' => 15, 'hourly_rate' => 70, 'min_charge' => 35, 'active' => true, 'sort_order' => 10, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Fiber Laser', 'code' => 'fiber', 'setup_minutes' => 14, 'setup_cost' => 20, 'hourly_rate' => 95, 'min_charge' => 45, 'active' => true, 'sort_order' => 20, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'CNC Router', 'code' => 'cnc', 'setup_minutes' => 18, 'setup_cost' => 22, 'hourly_rate' => 80, 'min_charge' => 40, 'active' => true, 'sort_order' => 30, 'created_at' => $now, 'updated_at' => $now],
        ];
        DB::table('machines')->upsert($machines, ['code']);

        $materials = [
            ['name' => 'Acrylic 3mm', 'sheet_width_mm' => 2440, 'sheet_height_mm' => 1220, 'sheet_price' => 85, 'waste_percent' => 10, 'active' => true, 'sort_order' => 10, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'MDF 6mm', 'sheet_width_mm' => 2440, 'sheet_height_mm' => 1220, 'sheet_price' => 42, 'waste_percent' => 12, 'active' => true, 'sort_order' => 20, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Mild Steel 1.5mm', 'sheet_width_mm' => 3000, 'sheet_height_mm' => 1500, 'sheet_price' => 160, 'waste_percent' => 15, 'active' => true, 'sort_order' => 30, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Stainless 1.5mm', 'sheet_width_mm' => 3000, 'sheet_height_mm' => 1500, 'sheet_price' => 260, 'waste_percent' => 15, 'active' => true, 'sort_order' => 40, 'created_at' => $now, 'updated_at' => $now],
        ];
        DB::table('materials')->upsert($materials, ['name']);

        $machineRows = DB::table('machines')->select(['id', 'code'])->get();
        $materialRows = DB::table('materials')->select(['id', 'name'])->get();
        foreach ($machineRows as $machine) {
            foreach ($materialRows as $material) {
                DB::table('machine_material_rates')->updateOrInsert(
                    [
                        'machine_id' => $machine->id,
                        'material_id' => $material->id,
                    ],
                    [
                        'cut_speed_mm_min' => $this->defaultSpeed((string)$machine->code, (string)$material->name),
                        'pierce_time_sec' => 0,
                        'active' => true,
                        'updated_at' => $now,
                        'created_at' => $now,
                    ]
                );
            }
        }
    }

    private function defaultSpeed(string $machineCode, string $materialName): float
    {
        $name = strtolower($materialName);

        return match ($machineCode) {
            'co2' => str_contains($name, 'acrylic') ? 900
                : (str_contains($name, 'mdf') ? 1200 : 450),
            'fiber' => str_contains($name, 'steel') ? 1800
                : (str_contains($name, 'stainless') ? 1300 : 700),
            default => str_contains($name, 'mdf') ? 2600 : 900,
        };
    }
}
