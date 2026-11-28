/* Select only the shop-reviewed pairs supplied by the server. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QuoteCuttingOptions = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const projects = new Set(['drawing', 'fiber', 'co2', 'acrylic', 'metal', 'wood']);
  const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

  function pairsFor(catalog, project) {
    if (!projects.has(project) || !catalog || !Array.isArray(catalog[project])) return [];
    const seen = new Set();
    return catalog[project].filter(pair => {
      if (!pair || !validId(pair.material_id) || !validId(pair.machine_id)) return false;
      const key = `${Number(pair.material_id)}:${Number(pair.machine_id)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(pair => ({materialId: String(Number(pair.material_id)), machineId: String(Number(pair.machine_id))}));
  }

  function choices(catalog, project, material) {
    const pairs = pairsFor(catalog, project);
    const materials = [...new Set(pairs.map(pair => pair.materialId))];
    const machines = [...new Set(pairs.filter(pair => pair.materialId === String(material)).map(pair => pair.machineId))];
    return {materials, machines};
  }

  function canAutofill(before, current) {
    return before && current && before.edits === current.edits && before.value === current.value
      && (!current.value || current.autoMeasured === '1');
  }
  return {pairsFor, choices, canAutofill};
});
