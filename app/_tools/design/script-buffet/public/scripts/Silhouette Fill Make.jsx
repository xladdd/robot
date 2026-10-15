#target illustrator

(function () {
    if (app.documents.length === 0) {
        alert("Open an Illustrator document first.");
        return;
    }

    var doc = app.activeDocument;
    var sel = doc.selection;

    if (!sel || sel.length === 0) {
        alert("Select the animal / grouped artwork first.");
        return;
    }

    // Keep references to the original artwork.
    var originals = [];
    for (var i = 0; i < sel.length; i++) {
        originals.push(sel[i]);
    }

    var oldActiveLayer = doc.activeLayer;
    var tempLayer = null;

    try {
        // Work on disposable duplicates so the original artwork is untouched.
        tempLayer = doc.layers.add();
        tempLayer.name = "__MAKE_SILHOUETTE_TEMP__";
        doc.activeLayer = tempLayer;

        var workGroup = tempLayer.groupItems.add();

        for (i = 0; i < originals.length; i++) {
            try {
                originals[i].duplicate(workGroup, ElementPlacement.PLACEATEND);
            } catch (dupErr) {}
        }

        if (workGroup.pageItems.length === 0) {
            throw new Error("Nothing usable could be duplicated from the selection.");
        }

        doc.selection = null;
        workGroup.selected = true;

        // Convert strokes/appearances to filled geometry.
        // "Live Outline Stroke" is the scriptable equivalent of Outline Stroke.
        safeMenu("Live Outline Stroke");
        safeMenu("expandStyle");

        // Re-group if expanding split the artwork into several selected items.
        if (doc.selection && doc.selection.length > 1) {
            safeMenu("group");
        }

        // Unite the geometry, then make the Pathfinder result real.
        safeMenu("Live Pathfinder Add");
        safeMenu("expandStyle");

        // Find the biggest CLOSED contour in the disposable result.
        // This is normally the outside edge of the whole animal.
        var paths = [];
        collectPaths(tempLayer, paths);

        var best = null;
        var bestArea = 0;

        for (i = 0; i < paths.length; i++) {
            var p = paths[i];

            try {
                if (!p.closed) continue;

                var a = Math.abs(Number(p.area));
                if (!isNaN(a) && a > bestArea) {
                    bestArea = a;
                    best = p;
                }
            } catch (areaErr) {}
        }

        if (!best || bestArea <= 0) {
            throw new Error(
                "I couldn't find a closed outside contour.\n\n" +
                "This usually means the outer line of the animal has a gap or the selected artwork is not made from vector paths."
            );
        }

        // Store the Bezier geometry before deleting the temporary layer.
        var shapeData = readPath(best);

        // Remove the disposable Pathfinder copy.
        doc.selection = null;
        tempLayer.remove();
        tempLayer = null;

        // Put the new silhouette in the same parent as the selected artwork
        // when possible, otherwise use its layer.
        var targetParent = getTargetParent(originals[0]);
        var silhouette = createPath(targetParent, shapeData);

        silhouette.name = "Silhouette Fill";
        silhouette.stroked = false;
        silhouette.filled = true;
        silhouette.opacity = 100;

        // Use the current Illustrator fill color.
        try {
            silhouette.fillColor = doc.defaultFillColor;
            if (silhouette.fillColor.typename === "NoColor") {
                silhouette.fillColor = fallbackColor();
            }
        } catch (fillErr) {
            silhouette.fillColor = fallbackColor();
        }

        // Place behind the selected artwork. Illustrator selection is normally
        // returned in stacking order, so the last selected item is the backmost.
        var anchor = originals[originals.length - 1];

        try {
            if (anchor.parent === silhouette.parent) {
                silhouette.move(anchor, ElementPlacement.PLACEAFTER);
            } else {
                silhouette.zOrder(ZOrderMethod.SENDTOBACK);
            }
        } catch (stackErr) {
            try { silhouette.zOrder(ZOrderMethod.SENDTOBACK); } catch (e) {}
        }

        // Leave only the new fill shape selected for immediate recoloring.
        doc.selection = null;
        silhouette.selected = true;

        try { doc.activeLayer = silhouette.layer; } catch (e2) {}
        app.redraw();

    } catch (err) {
        try {
            doc.selection = null;
            if (tempLayer) tempLayer.remove();
        } catch (cleanupErr) {}

        try { doc.activeLayer = oldActiveLayer; } catch (restoreErr) {}

        alert("Make Silhouette Fill\n\n" + err.message);
    }

    function safeMenu(commandName) {
        try {
            app.executeMenuCommand(commandName);
        } catch (e) {
            // Some commands legitimately do nothing for certain artwork types.
        }
    }

    function collectPaths(container, out) {
        var items;
        try {
            items = container.pageItems;
        } catch (e) {
            return;
        }

        for (var j = 0; j < items.length; j++) {
            var item = items[j];

            if (item.typename === "PathItem") {
                if (!item.guides && !item.clipping) {
                    out.push(item);
                }
            } else if (item.typename === "GroupItem") {
                collectPaths(item, out);
            } else if (item.typename === "CompoundPathItem") {
                for (var k = 0; k < item.pathItems.length; k++) {
                    if (!item.pathItems[k].guides && !item.pathItems[k].clipping) {
                        out.push(item.pathItems[k]);
                    }
                }
            }
        }
    }

    function readPath(src) {
        var data = {
            closed: src.closed,
            evenodd: false,
            points: []
        };

        try { data.evenodd = src.evenodd; } catch (e) {}

        for (var j = 0; j < src.pathPoints.length; j++) {
            var sp = src.pathPoints[j];

            data.points.push({
                anchor: [sp.anchor[0], sp.anchor[1]],
                left: [sp.leftDirection[0], sp.leftDirection[1]],
                right: [sp.rightDirection[0], sp.rightDirection[1]],
                pointType: sp.pointType
            });
        }

        return data;
    }

    function createPath(parent, data) {
        var p;

        if (parent.typename === "Layer" || parent.typename === "GroupItem") {
            p = parent.pathItems.add();
        } else {
            p = doc.activeLayer.pathItems.add();
        }

        p.closed = data.closed;
        try { p.evenodd = data.evenodd; } catch (e) {}

        for (var j = 0; j < data.points.length; j++) {
            var np = p.pathPoints.add();
            np.anchor = data.points[j].anchor;
            np.leftDirection = data.points[j].left;
            np.rightDirection = data.points[j].right;
            np.pointType = data.points[j].pointType;
        }

        return p;
    }

    function getTargetParent(item) {
        try {
            var par = item.parent;

            // A path can be placed directly into a layer or group.
            if (par && (par.typename === "Layer" || par.typename === "GroupItem")) {
                return par;
            }
        } catch (e) {}

        try {
            return item.layer;
        } catch (e2) {
            return doc.activeLayer;
        }
    }

    function fallbackColor() {
        var c = new RGBColor();
        c.red = 220;
        c.green = 220;
        c.blue = 220;
        return c;
    }
})();
