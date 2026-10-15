// InDesign Toggle Lock Script
(function () {
  if (app.documents.length === 0 || app.selection.length === 0) return;

  var sel = app.selection;

  // Check the first item to determine the action (lock or unlock)
  var shouldLock = !sel[0].locked;

  // Apply to all selected items
  for (var i = 0; i < sel.length; i++) {
    try {
      sel[i].locked = shouldLock;
    } catch (e) {
      // Fails silently if an item is on a locked layer
    }
  }
})();
