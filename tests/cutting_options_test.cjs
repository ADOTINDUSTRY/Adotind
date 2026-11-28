const assert = require('node:assert/strict');
const {pairsFor, choices, canAutofill} = require('../public/assets/js/cutting-options.js');
const reviewed = {
  fiber: [{machine_id: 3, material_id: 12}, {machine_id: 3, material_id: 13}],
  acrylic: [{machine_id: 1, material_id: 14}, {machine_id: 2, material_id: 14}],
  co2: [],
};
assert.deepEqual(choices(reviewed, 'fiber', ''), {materials:['12','13'], machines:[]});
assert.deepEqual(choices(reviewed, 'fiber', '12'), {materials:['12','13'], machines:['3']});
assert.deepEqual(choices(reviewed, 'acrylic', '14'), {materials:['14'], machines:['1','2']});
assert.deepEqual(choices(reviewed, 'co2', ''), {materials:[], machines:[]});
assert.deepEqual(choices(reviewed, 'wood', ''), {materials:[], machines:[]});
assert.deepEqual(pairsFor({evil:[{machine_id:1, material_id:2}]}, 'evil'), []);
assert.deepEqual(pairsFor({fiber:[null, {machine_id:0, material_id:1}, {machine_id:2, material_id:3}, {machine_id:'2',material_id:'3'}]}, 'fiber'), [{machineId:'2',materialId:'3'}]);
assert.equal(canAutofill({value:'',edits:0}, {value:'',edits:0}), true);
assert.equal(canAutofill({value:'',edits:0}, {value:'',edits:2}), false, 'typing then clearing while measuring is still an edit');
assert.equal(canAutofill({value:'100',edits:1}, {value:'100',edits:1}), false, 'manually entered dimensions are preserved');
assert.equal(canAutofill({value:'100',edits:1}, {value:'100',edits:1,autoMeasured:'1'}), true);
console.log('Cutting project choices passed.');
