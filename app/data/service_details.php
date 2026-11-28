<?php
declare(strict_types=1);

// Customer-facing guidance for each service. Final specifications depend on the
// artwork, material, machine setup and the requirements of each project.
return [
    'sign-manufacturing' => [
        'intro' => [
            'From a single set of letters to a complete shopfront, we manufacture signage to suit your design, location and installation needs. We can combine cut panels, dimensional letters, printed graphics and illumination in one project.',
            'Choose a clean non-illuminated finish or discuss illuminated options such as front-lit 3D letters and indoor neon-style LED signs. We can help you select the materials and finish for the intended setting.'
        ],
        'considerations' => ['Where the sign will be installed and whether it is indoors or outdoors', 'Approximate overall size, artwork, colours and preferred finish', 'Whether the sign needs lighting, mounting or installation'],
        'process' => ['Share your design, logo or an idea and approximate dimensions', 'We review the location, materials, illumination and mounting', 'We prepare the production plan and confirm the quotation', 'We manufacture, assemble and check the sign before delivery or installation'],
    ],
    'cnc-router-services' => [
        'intro' => [
            'CNC routing is suitable for accurately cutting and machining panels, shapes and components from your drawing. It can be used for signage, decorative panels, furniture parts and other custom projects.',
            'Our routers have working areas of approximately 1.5 × 2.6 m and 2 × 3 m. The usable area for a particular job depends on the material, tooling, workholding and design.'
        ],
        'considerations' => ['A dimensioned drawing or vector file, such as DXF, if available', 'Material type, thickness, finished size and number of pieces', 'Any engraving, holes, edge finish or assembly requirements'],
        'process' => ['Send your drawing or describe the part you need', 'We check the geometry, material and machining requirements', 'We confirm the quotation and prepare the cutting or engraving paths', 'Parts are machined and checked for the agreed finish'],
    ],
    'laser-cutting-engraving' => [
        'intro' => [
            'We offer laser cutting for custom shapes, parts and decorative work. Our fiber laser is used for suitable metals, while our CO2 laser is used for suitable non-metal materials such as acrylic and wood.',
            'The fiber laser has an approximately 1.5 × 3 m working area and the CO2 laser approximately 1.4 × 1 m. Material type, thickness, geometry and machine setup determine whether a particular job can be cut or engraved.'
        ],
        'considerations' => ['A vector drawing such as DXF and the required dimensions', 'Material, thickness, quantity and any engraving requirements', 'Whether the pieces have small details, holes or a required edge finish'],
        'process' => ['Send the drawing or discuss your design with us', 'We review the geometry and choose a suitable machine and material', 'We confirm the quotation and prepare the production file', 'We cut or engrave the parts and check the finished pieces'],
    ],
    'large-format-printing' => [
        'intro' => [
            'Our large-format eco-solvent printing supports graphics for signs, panels, promotional displays and other visual projects. We can combine printed graphics with cut panels and signage produced in the workshop.',
            'Tell us where the graphic will be used and how it will be applied. We can discuss suitable printable media and finishing, including lamination where appropriate.'
        ],
        'considerations' => ['Finished dimensions, quantity and the surface receiving the graphic', 'Your print-ready artwork, logo or design requirements', 'Indoor or outdoor use and any cutting or lamination required'],
        'process' => ['Share your artwork, dimensions and intended application', 'We review the file, media and finishing requirements', 'We confirm the quotation and prepare the print', 'We print, finish and check the graphics for collection or delivery'],
    ],
    'industrial-fabrication' => [
        'intro' => [
            'We make custom metal components and welded assemblies for commercial, signage and general manufacturing projects. This can include brackets, support frames and other project-specific structures.',
            'Each design is reviewed for the intended application, materials and manufacturing method. Where a project needs specialist engineering or certification, the requirements should be agreed before production.'
        ],
        'considerations' => ['A drawing, measurements or clear description of the component', 'Intended use, material, quantity and any load or fixing requirements', 'Required finish, installation details and project deadline'],
        'process' => ['Share your measurements, drawing and intended use', 'We review the construction, material and fabrication requirements', 'We confirm the scope and quotation before production', 'Components are cut, fabricated and checked against the agreed requirements'],
    ],
    '3d-manufacturing' => [
        'intro' => [
            'We manufacture dimensional elements for signs and custom projects, including 3D letter components. Shapes can be cut, bent, assembled and finished according to the design.',
            'Tell us what you want to make and how it will be used. We will review the geometry and suggest a practical production approach for the project.'
        ],
        'considerations' => ['Artwork or a drawing, finished dimensions and quantity', 'The desired depth, material, colour and surface finish', 'Whether lighting, mounting or assembly is needed'],
        'process' => ['Share the design and describe the intended result', 'We review dimensions, materials and manufacturing options', 'We agree the specification and quotation', 'Components are produced, assembled where needed and checked'],
    ],
    'additional-services' => [
        'intro' => [
            'Some projects need more than one process. Alongside manufacturing, we offer supporting services such as vinyl cutting, lamination and installation support where appropriate.',
            'Tell us about the complete project, including what has already been prepared. We can review the remaining steps and discuss a practical way to finish it.'
        ],
        'considerations' => ['The item or artwork and what work has already been completed', 'Finished size, quantity, material and intended location', 'Whether cutting, lamination, delivery or installation support is needed'],
        'process' => ['Describe the work and share any artwork or photos', 'We review the materials, finishing and project requirements', 'We confirm the scope and quotation', 'The agreed work is completed and checked for handover'],
    ],
];
