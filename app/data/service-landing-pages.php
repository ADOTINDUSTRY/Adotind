<?php
declare(strict_types=1);

// These are service information pages; a quote link does not promise availability or a final price.
return [
    'cnc-acrylic-cutting' => [
        'name' => 'CNC Acrylic Cutting', 'parent' => 'cnc-router-services', 'workflow' => 'drawing',
        'summary' => 'Custom routed acrylic shapes, letters and panels for signs, displays and other projects in Cyprus.',
        'intro' => 'CNC routing can produce acrylic pieces from a vector drawing. It is useful for larger panels and shapes where the appropriate tool and cutting method can be selected for the design.',
        'uses' => ['Flat-cut sign letters and logos', 'Display panels and custom acrylic shapes', 'Parts with holes or internal cut-outs'],
        'details' => ['Share a DXF or vector drawing, finished dimensions and quantity.', 'Tell us the acrylic colour, thickness and whether edges need a particular finish.', 'The tool radius, small features and material availability need review before production.'],
        'question' => 'Can I get help if I only have an image?', 'answer' => 'Yes. Send the image and your intended dimensions. We can discuss preparing a suitable drawing and confirm any design work before proceeding.',
    ],
    'cnc-wood-cutting' => [
        'name' => 'CNC Wood and Plywood Cutting', 'parent' => 'cnc-router-services', 'workflow' => 'drawing',
        'summary' => 'CNC routing for custom wood and plywood panels, parts and decorative shapes.',
        'intro' => 'A router follows a vector design to cut or machine sheet material. This is useful for repeated components, decorative panels and pieces that need holes or internal shapes.',
        'uses' => ['Decorative wall panels', 'Furniture components and templates', 'Custom plywood shapes'],
        'details' => ['Send a drawing with the size and number of pieces.', 'Specify material type, thickness and grain direction if it matters.', 'Small inside corners depend on cutter diameter; sheet layout and finishing are checked for each job.'],
        'question' => 'Can I provide my own drawing?', 'answer' => 'Yes. A DXF is a useful starting point. We can check its scale and cutting details before it is used for production.',
    ],
    'laser-cut-acrylic' => [
        'name' => 'Laser Cut Acrylic', 'parent' => 'laser-cutting-engraving', 'workflow' => 'co2',
        'summary' => 'CO2 laser cutting for custom acrylic letters, shapes and display components.',
        'intro' => 'A CO2 laser follows a vector path to cut acrylic. It can be useful for sign letters, logos and display pieces; the design and acrylic grade affect the finish and suitability.',
        'uses' => ['Acrylic logos and lettering', 'Display components and decorative shapes', 'Panels with detailed cut-outs'],
        'details' => ['Provide a DXF or vector design, dimensions and quantity.', 'Tell us the colour and thickness you prefer; availability must be checked.', 'Fine details, edge finish and sheet size depend on the specific design and material.'],
        'question' => 'Can you cut a logo from a picture?', 'answer' => 'We can review the image and discuss preparing a vector outline. A picture is not itself a cutting file, so the proposed outline should be checked first.',
    ],
    'laser-cut-wood' => [
        'name' => 'Laser Cut Wood and Plywood', 'parent' => 'laser-cutting-engraving', 'workflow' => 'co2',
        'summary' => 'Custom CO2 laser cutting for suitable wood and plywood designs.',
        'intro' => 'Laser cutting can create detailed profiles in suitable wood and plywood. Different sheets and adhesives react differently, so we check the actual material and design before accepting a job.',
        'uses' => ['Decorative names and shapes', 'Models, templates and small panels', 'Custom components with intricate outlines'],
        'details' => ['Share the design, finished size and quantity.', 'Tell us the wood type and thickness, or ask about available material.', 'Laser-cut edges can darken; fine features and material suitability require review.'],
        'question' => 'Is every plywood suitable for laser cutting?', 'answer' => 'No. Plywood varies in layers and adhesives. We check whether the particular sheet and thickness are appropriate before cutting.',
    ],
    'fiber-laser-metal-cutting' => [
        'name' => 'Fiber Laser Metal Cutting', 'parent' => 'laser-cutting-engraving', 'workflow' => 'fiber',
        'summary' => 'Custom fiber laser cutting for metal profiles and components in Cyprus.',
        'intro' => 'Fiber laser cutting follows vector paths to produce metal parts and profiles. The material, thickness, geometry and quantity determine the manufacturing approach and quotation.',
        'uses' => ['Brackets and flat components', 'Metal lettering and sign elements', 'Custom profiles with holes and slots'],
        'details' => ['Send a DXF or other vector drawing with the intended finished dimensions.', 'Specify the metal, thickness, quantity and any required finish.', 'Cutting capacity, small features and material availability are confirmed for each job.'],
        'question' => 'Can you cut stainless or carbon steel?', 'answer' => 'These are among the metals we work with. We confirm the particular grade, thickness and job requirements before providing a quotation.',
    ],
    'custom-neon-signs' => [
        'name' => 'Custom LED Neon Signs', 'parent' => 'sign-manufacturing', 'workflow' => 'neon',
        'summary' => 'Plan an indoor LED neon-style sign with custom text, colours and an acrylic backing.',
        'intro' => 'LED neon-style signs use a flexible illuminated strip and cover to create lettering or shapes. A suitable backing, mounting method and power supply depend on the design.',
        'uses' => ['Business names and interior branding', 'Events and decorative lettering', 'Custom messages for indoor spaces'],
        'details' => ['Share your wording, approximate size and preferred colours.', 'Tell us where the sign will be installed and how you want it mounted.', 'The current neon designer is for indoor use; production details and availability need checking.'],
        'question' => 'Can I preview my text?', 'answer' => 'Our neon designer is currently in private testing. If you do not have access, contact us and we can discuss your design.',
    ],
    '3d-channel-letters' => [
        'name' => 'Custom 3D Sign Letters', 'parent' => 'sign-manufacturing', 'workflow' => null,
        'summary' => 'Dimensional sign letters for shopfronts and interior branding, with illuminated or non-illuminated options.',
        'intro' => 'Three-dimensional letters can be made to suit a brand and installation location. Face, return, lighting and mounting choices affect appearance, production and maintenance.',
        'uses' => ['Shopfront and reception signs', 'Front-lit channel lettering', 'Non-illuminated dimensional logos'],
        'details' => ['Send your logo or wording and an approximate overall width.', 'Share a photo of the installation surface and tell us if the sign is indoors or outdoors.', 'Lighting, electrical work, fixing method and site conditions are reviewed before quotation.'],
        'question' => 'Can you help choose the lighting?', 'answer' => 'Yes. Tell us the appearance and installation location you have in mind and we can discuss suitable lighting and materials.',
    ],
    'custom-print-graphics' => [
        'name' => 'Large Format Printing and Graphics', 'parent' => 'large-format-printing', 'workflow' => null,
        'summary' => 'Custom printed graphics for signs, panels and promotional applications.',
        'intro' => 'Large-format eco-solvent printing can produce graphics for suitable vinyl and other printable media. The right media and finishing depend on how and where the graphics will be used.',
        'uses' => ['Self-adhesive vinyl graphics', 'Sign and panel graphics', 'Promotional graphics and wallpaper applications'],
        'details' => ['Provide artwork, final dimensions and quantity.', 'Tell us whether the graphics are for indoor or outdoor use and the application surface.', 'Media, colour expectations, lamination and installation requirements should be confirmed.'],
        'question' => 'Can printed graphics be added to a cut panel?', 'answer' => 'We can discuss combining printed vinyl and a cut panel. The finish and suitability depend on the material and intended use.',
    ],
    'custom-metal-fabrication' => [
        'name' => 'Custom Metal Fabrication', 'parent' => 'industrial-fabrication', 'workflow' => null,
        'summary' => 'Custom metal components, frames and welded assemblies for commercial projects.',
        'intro' => 'A fabrication project can combine cutting, forming or welding according to its design. We review the drawings and intended use before deciding the appropriate production method.',
        'uses' => ['Custom frames and brackets', 'Supports for signs and displays', 'Project-specific welded components'],
        'details' => ['Share drawings, dimensions and quantities, or describe the intended function.', 'Specify material and finish if known.', 'Loads, tolerances, site requirements and suitability must be reviewed for each project.'],
        'question' => 'What if I do not have a technical drawing?', 'answer' => 'Send a sketch or description with the main dimensions and intended use. We can discuss what information is needed to assess the work.',
    ],
];
