#target "InDesign"

/* Creates a filled silhouette from selected vector page items without changing the originals. */
(function () {
    var TITLE = "Make Silhouette Fill";
    var doc, originals, tempLayer, silhouette;

    if (!app.documents.length) {
        alert("Open an InDesign document first.", TITLE);
        return;
    }

    doc = app.activeDocument;
    if (!doc.selection || doc.selection.length === 0) {
        alert("Select vector artwork first.", TITLE);
        return;
    }

    originals = [];
    for (var i = 0; i < doc.selection.length; i++) {
        if (isPageItem(doc.selection[i])) originals.push(doc.selection[i]);
    }

    if (!originals.length) {
        alert("The selection does not contain usable page items.", TITLE);
        return;
    }

    try {
        app.doScript(run, ScriptLanguage.JAVASCRIPT, undefined,
            UndoModes.ENTIRE_SCRIPT, TITLE);
    } catch (err) {
        try { if (tempLayer && tempLayer.isValid) tempLayer.remove(); } catch (_) {}
        alert(TITLE + "\n\n" + err.message, TITLE);
    }

    function run() {
        var sourceItems = [];
        var result;

        tempLayer = doc.layers.add();
        tempLayer.name = "__MAKE_SILHOUETTE_TEMP__";

        for (var j = 0; j < originals.length; j++) {
            var copy = originals[j].duplicate(tempLayer);
            collectVectorItems(copy, sourceItems);
        }

        if (!sourceItems.length) {
            throw new Error("No vector paths were found. Placed images and other raster artwork are not supported.");
        }

        result = sourceItems[0];
        if (sourceItems.length > 1) {
            var others = sourceItems.slice(1);
            // Pathfinder replaces the input item. Keep its returned replacement;
            // the original `result` reference becomes invalid after this call.
            result = result.addPath(others);
        }

        // Keep only the largest closed contour, matching the Illustrator version.
        var outerPath = getLargestClosedPath(result);
        if (!outerPath) {
            throw new Error(
                "No closed outside contour was found.\n\n" +
                "The selected artwork must contain closed vector shapes."
            );
        }

        var targetLayer = getTargetLayer(originals[0]);
        var targetContainer = getTargetContainer(originals[0]);
        tempLayer.remove();
        tempLayer = null;

        // Build a fresh one-path polygon instead of copying the Pathfinder object.
        var shape = targetContainer.polygons.add(targetLayer);
        shape.paths[0].entirePath = outerPath;
        shape.paths[0].pathType = PathType.CLOSED_PATH;

        shape.name = "Silhouette Fill";
        shape.fillColor = getFillColor();
        shape.strokeColor = getNoneSwatch();
        shape.strokeWeight = 0;

        try { shape.sendToBack(); } catch (_) {}

        shape.select(SelectionOptions.REPLACE_WITH);
        silhouette = shape;
    }

    function isPageItem(item) {
        try {
            var type = item.constructor.name;
            return type === "Group" || type === "Rectangle" || type === "Oval" ||
                type === "Polygon" || type === "GraphicLine" || type === "SplineItem";
        } catch (_) {
            return false;
        }
    }

    function collectVectorItems(item, out) {
        var type = item.constructor.name;
        if (type === "Group") {
            var children = item.pageItems.everyItem().getElements();
            for (var k = 0; k < children.length; k++) collectVectorItems(children[k], out);
        } else if (type === "Rectangle" || type === "Oval" || type === "Polygon" ||
                type === "GraphicLine" || type === "SplineItem") {
            out.push(item);
        }
    }

    function getLargestClosedPath(item) {
        var paths = item.paths.everyItem().getElements();
        var best = null;
        var bestArea = 0;

        for (var j = 0; j < paths.length; j++) {
            try {
                if (paths[j].pathType != PathType.CLOSED_PATH) continue;
                var data = clonePath(paths[j].entirePath);
                var area = Math.abs(bezierPathArea(data));
                if (area > bestArea) {
                    bestArea = area;
                    best = data;
                }
            } catch (_) {}
        }

        return best;
    }

    function clonePath(path) {
        var copy = [];
        for (var j = 0; j < path.length; j++) {
            if (typeof path[j][0] === "number") {
                copy.push([Number(path[j][0]), Number(path[j][1])]);
            } else {
                copy.push([
                    [Number(path[j][0][0]), Number(path[j][0][1])],
                    [Number(path[j][1][0]), Number(path[j][1][1])],
                    [Number(path[j][2][0]), Number(path[j][2][1])]
                ]);
            }
        }
        return copy;
    }

    function bezierPathArea(path) {
        var points = [];
        var steps = 12;

        for (var j = 0; j < path.length; j++) {
            var current = pointParts(path[j]);
            var next = pointParts(path[(j + 1) % path.length]);
            if (j === 0) points.push(current.anchor);

            for (var step = 1; step <= steps; step++) {
                var t = step / steps;
                var u = 1 - t;
                points.push([
                    u * u * u * current.anchor[0] +
                        3 * u * u * t * current.right[0] +
                        3 * u * t * t * next.left[0] +
                        t * t * t * next.anchor[0],
                    u * u * u * current.anchor[1] +
                        3 * u * u * t * current.right[1] +
                        3 * u * t * t * next.left[1] +
                        t * t * t * next.anchor[1]
                ]);
            }
        }

        var area = 0;
        for (j = 0; j < points.length; j++) {
            var a = points[j];
            var b = points[(j + 1) % points.length];
            area += a[0] * b[1] - b[0] * a[1];
        }
        return area / 2;
    }

    function pointParts(point) {
        if (typeof point[0] === "number") {
            return {left: point, anchor: point, right: point};
        }
        return {left: point[0], anchor: point[1], right: point[2]};
    }

    function getTargetLayer(item) {
        try {
            if (item.itemLayer) return item.itemLayer;
        } catch (_) {}
        return doc.activeLayer;
    }

    function getTargetContainer(item) {
        try {
            if (item.parentPage && item.parentPage.isValid) return item.parentPage;
        } catch (_) {}

        var parent = item;
        while (parent) {
            try {
                var type = parent.constructor.name;
                if (type === "Page" || type === "Spread" || type === "MasterSpread") {
                    return parent;
                }
                parent = parent.parent;
            } catch (_) {
                break;
            }
        }

        return app.activeWindow.activePage;
    }

    function getFillColor() {
        try {
            var color = doc.defaultFillColor;
            var none = getNoneSwatch();
            if (color && color.isValid && (!none.isValid || color.id != none.id)) return color;
        } catch (_) {}
        try {
            var black = doc.swatches.itemByName("$ID/Black");
            if (black.isValid) return black;
        } catch (__) {}
        try {
            black = doc.swatches.itemByName("Black");
            if (black.isValid) return black;
        } catch (___) {}
        return doc.swatches[0];
    }

    function getNoneSwatch() {
        try {
            var none = doc.swatches.itemByName("$ID/None");
            if (none.isValid) return none;
        } catch (_) {}
        try {
            none = doc.swatches.itemByName("None");
            if (none.isValid) return none;
        } catch (__) {}
        return doc.swatches[0];
    }
})();
