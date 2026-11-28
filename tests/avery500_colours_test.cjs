'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../app/data/avery500-colours.json'),'utf8'));
assert.equal(data.series,'Avery Dennison 500 Event Film');
assert.equal(new URL(data.source).hostname,'graphics.averydennison.com');
assert.match(data.note,/illustrative approximations/i);assert.match(data.note,/physical sample/i);assert.match(data.note,/not stock/i);
assert.equal(data.colours.length,46);const codes=new Set();
for(const item of data.colours){assert.match(item.code,/^\d{3} EF$/);assert(!codes.has(item.code),'duplicate colour code');codes.add(item.code);assert(item.name);assert.match(item.hex,/^#[0-9a-f]{6}$/i);assert(item.finishes.length&&item.finishes.every(x=>['gloss','matt'].includes(x)));assert.equal(new Set(item.finishes).size,item.finishes.length)}
assert.equal(data.colours.filter(c=>c.finishes.includes('gloss')).length,45);assert.equal(data.colours.filter(c=>c.finishes.includes('matt')).length,44);
const byCode=Object.fromEntries(data.colours.map(c=>[c.code,c]));
assert.deepEqual(byCode['511 EF'].finishes,['gloss']);assert.deepEqual(byCode['514 EF'].finishes,['gloss']);assert.deepEqual(byCode['543 EF'].finishes,['matt']);assert.equal(byCode['548 EF'],undefined);
assert.equal(byCode['509 EF'].finish_names.matt,'Orange LF');assert.equal(byCode['513 EF'].finish_names.matt,'Burgundy Red');
console.log('Avery 500 Event Film catalogue and finish availability checks passed.');
