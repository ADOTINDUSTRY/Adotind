# Cutting quote safety settings

The private cutting estimator uses `quote-system.sqlite` in the website media volume. Keep the testing PIN in place until the owner explicitly opens the service.

On first use after this update the public website advances the database schema from version 3 to version 4. The additive migration adds nullable `bed_width_mm` and `bed_height_mm` columns to `quote_machines`, and a `shop_reviewed` flag to `quote_machine_materials`. The ERP's website settings can add the same columns first; both migrations check whether each column already exists. No existing machine, material, price or rate is overwritten. Back up the website database and media volume before deployment.

Existing rates default to **not reviewed**, even when active: the old system seeded rates for every machine/material combination. As a result, no existing combination receives an instant estimate until the shop records the actual working dimensions for that particular machine and explicitly reviews and approves that exact machine, material, thickness, speed and pierce time in the ERP. A single ambiguous router entry does not establish which router is used. Do not copy an assumed bed size into a machine entry.

The entered part and configured material sheet must each fit the configured bed in one orientation. A sheet that requires pre-cutting, feeding or repositioning needs manual review rather than an assumed automatic estimate. Recognized CO2 and PVC/vinyl combinations are blocked even when a rate is reviewed. Names alone cannot establish a material's composition or an ambiguously named machine's type; the shop must verify both.

The submitted part width and height are currently entered by the customer. The server measures supported DXF path length but does not independently verify the drawing's full bounding dimensions. The result is therefore preliminary and requires shop review of the actual drawing, dimensions, material, production feasibility and final price. The current implementation does not automatically decide how to split sheets or choose a machine.
