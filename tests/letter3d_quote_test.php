<?php
declare(strict_types=1);
require __DIR__ . '/../app/lib/letter3d_quote.php';
function check3d(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function rejects3d(callable $fn, string $message): void { try { $fn(); } catch (DomainException $e) { return; } throw new RuntimeException($message); }
$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
letter3d_schema($db);
$input = ['product_id'=>1,'text'=>'A B','font'=>'sans','colour'=>'#ff00aa','width_mm'=>1000,'height_mm'=>500,'quantity'=>2];
rejects3d(fn()=>letter3d_calculate($db,$input,19), 'An unconfigured product must not get a price.');
$db->exec("INSERT INTO quote_letter3d_products(name,description,setup_eur,letter_eur,area_eur_m2,minimum_eur,min_width_mm,max_width_mm,min_height_mm,max_height_mm,max_characters,max_quantity,enabled,reviewed) VALUES ('Acrylic letters','',10,5,20,0,100,3000,50,2000,50,10,1,1)");
$result = letter3d_calculate($db,$input,19);
check3d($result['characters']===2 && $result['subtotal']===50.0 && $result['vat']===9.5 && $result['total']===59.5, 'Shop-defined prices and VAT must be calculated correctly.');
check3d(letter3d_vat(['vat_percent'=>'0'])===0.0, 'An explicitly configured zero VAT rate must be allowed.');
rejects3d(fn()=>letter3d_vat([]), 'Missing VAT must fail closed.');
rejects3d(fn()=>letter3d_vat(['vat_percent'=>'not a number']), 'Invalid VAT must fail closed.');
$db->exec("UPDATE quote_letter3d_products SET description='Changed terms'");
check3d(letter3d_calculate($db,$input,19)['quote_token'] !== $result['quote_token'], 'Changed terms must require a fresh confirmation even when the total is unchanged.');
$accented = $input; $accented['text']="A\u{0301}B";
check3d(letter3d_calculate($db,$accented,19)['characters']===2, 'Combining marks must not count as extra letters.');
$bad=$input; $bad['width_mm']=3001; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Oversized design must be rejected.');
$bad=$input; $bad['quantity']=11; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Excess quantity must be rejected.');
$multi=$input; $multi['text']="A\r\nB"; $multiResult=letter3d_calculate($db,$multi,19);
check3d($multiResult['characters']===2 && $multiResult['text']==="A\nB" && $multiResult['total']===59.5, 'Line breaks must be normalised, preserved and excluded from character prices.');
$normal=$multi; $normal['text']="A\nB"; check3d(letter3d_calculate($db,$normal,19)['quote_token']===$multiResult['quote_token'], 'Browser newline formats must produce the same quote.');
$normal['text']="AB"; check3d(letter3d_calculate($db,$normal,19)['quote_token']!==$multiResult['quote_token'], 'Changing the line layout must invalidate the confirmed design token.');
$bad=$input; $bad['text']=implode("\n",array_fill(0,9,'A')); rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'More than eight lines must be rejected.');
$bad=$input; $bad['text']="A\tB"; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Control characters must be rejected.');
$bad=$input; $bad['colour']='red" onload="x'; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Invalid colour must be rejected.');
$bad=$input; $bad['font']='other'; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Unknown style must be rejected.');
$modern=$input; $modern['lines']=[
    ['text'=>'A','font'=>'sans','colour'=>'#ff00AA','x'=>0,'y'=>0,'rotation'=>0],
    ['text'=>'B','font'=>'serif','colour'=>'#123456','x'=>25,'y'=>-20,'rotation'=>45],
];
$modern['text']='IGNORED'; $modern['font']='invalid'; $modern['colour']='invalid';
$priced=letter3d_calculate($db,$modern,19);
check3d($priced['text']==="A\nB" && $priced['characters']===2 && $priced['total']===59.5 && $priced['lines'][1]['font']==='serif'
    && $priced['lines'][1]['rotation']===45.0 && $priced['lines'][0]['colour']==='#ff00aa', 'The validated lines must drive pricing and saved design, not legacy globals.');
foreach (['text'=>'C','font'=>'script','colour'=>'#ffffff','x'=>26,'y'=>-19,'rotation'=>46] as $key=>$value) {
    $changed=$modern; $changed['lines'][1][$key]=$value;
    check3d(letter3d_calculate($db,$changed,19)['quote_token']!==$priced['quote_token'], "Changes to $key must invalidate the confirmation token.");
}
$bad=$modern; $bad['lines'][0]['x']=201; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Out-of-range position must fail.');
$bad=$modern; $bad['lines'][0]['y']=-201; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Out-of-range position must fail.');
$bad=$modern; $bad['lines'][0]['rotation']=181; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Out-of-range rotation must fail.');
$bad=$modern; $bad['lines'][0]['rotation']='NaN'; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Non-finite rotation must fail.');
$bad=$modern; $bad['lines'][0]['text']="A\nB"; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'A line must not contain a newline.');
$bad=$modern; $bad['lines'][0]['colour']='#000'; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Invalid per-line colour must fail.');
$bad=$modern; $bad['lines']=array_fill(0,9,$modern['lines'][0]); rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Excess lines must fail.');
$bad=$modern; $bad['lines']=['not-a-list'=>$modern['lines'][0]]; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Object-shaped line collection must fail.');
$bad=$modern; $bad['lines'][0]['text']=' '; $bad['lines'][1]['text']=''; rejects3d(fn()=>letter3d_calculate($db,$bad,19), 'Whitespace-only design must fail.');
$graphemes=$modern; $graphemes['lines'][0]['text']='A'; $graphemes['lines'][1]['text']="\u{0301}";
check3d(letter3d_calculate($db,$graphemes,19)['characters']===2, 'Graphemes on separate lines must not merge.');
$db->exec('UPDATE quote_letter3d_products SET reviewed=0');
rejects3d(fn()=>letter3d_calculate($db,$input,19), 'Unreviewed rates must not get a price.');
echo "3D lettering pricing checks passed.\n";
