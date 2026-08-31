/* Import Solutions Importer JSON into the active InDesign document.
 *
 * Uses live table-cell anchors. It replaces all existing SOLUTIONS-layer
 * items only after the new import finishes successfully.
 */

#target "InDesign"

(function () {
    var TITLE = "Import Solutions (Advanced)";
    var TEST_JSON_PATH = $.global.__SOLUTIONS_JSON_PATH__ || "";
    var LAYER_NAME = "SOLUTIONS";
    var TEXT_STYLE_NAME = "Solutions";
    var CELL_STYLE_NAME = "Cell Solutions";
    var SWATCH_NAME = "SOLUTIONS";
    var GENERATED_PREFIX = "Solutions Advanced:";
    var AUTOMATED = $.global.__SOLUTIONS_BETA_AUTOMATED__ === true;
    var noneCharacterStyle = null;

    if (!app.documents.length) {
        notify("Open the matching InDesign chapter before running this script.");
        return;
    }

    app.doScript(run, ScriptLanguage.JAVASCRIPT, undefined,
        UndoModes.ENTIRE_SCRIPT, TITLE);

    function run() {
        var jsonFile = TEST_JSON_PATH ? File(TEST_JSON_PATH) : null;
        if (!jsonFile || !jsonFile.exists)
            jsonFile = File.openDialog("Choose Solutions Importer JSON", "JSON:*.json");
        if (!jsonFile) return;

        var data = readJson(jsonFile);
        if (!data) return;
        if (data.format !== "indesign-solutions-v2" || !data.pages) {
            notify("This is not Solutions Importer JSON.");
            return;
        }

        var doc = app.activeDocument;
        if (data.pages.length !== doc.pages.length) {
            notify("Page-count mismatch.\n\nJSON: " + data.pages.length +
                "\nInDesign: " + doc.pages.length);
            return;
        }
        if (!confirmPageNames(doc, data)) return;

        var layer = ensureLayer(doc);
        var oldItems = collectLayerItems(layer);
        var swatch = ensureSolutionSwatch(doc);
        var typography = readTypography(data);
        var font = resolveFont(typography.fontFamily);
        if (!font) {
            notify('The selected font "' + typography.fontFamily + '" is not installed.');
            return;
        }
        var textStyle = ensureParagraphStyle(
            doc, TEXT_STYLE_NAME, swatch, font, typography.pointSize, true
        );
        var cellStyle = ensureParagraphStyle(
            doc, CELL_STYLE_NAME, swatch, font, typography.pointSize, true
        );
        noneCharacterStyle = getNoneCharacterStyle(doc);

        var oldH = doc.viewPreferences.horizontalMeasurementUnits;
        var oldV = doc.viewPreferences.verticalMeasurementUnits;
        var oldOrigin = doc.viewPreferences.rulerOrigin;
        doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
        doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.POINTS;
        doc.viewPreferences.rulerOrigin = RulerOrigin.PAGE_ORIGIN;
        var lockedStates = [];
        var createdItems = [];
        var tableCharacters = 0;
        var continuations = 0;
        var looseFrames = 0;
        var unresolved = [];
        var unsupported = 0;
        var processed = 0;
        var total = countEnabledOperations(data);

        try {
            for (var layerIndex = 0; layerIndex < doc.layers.length; layerIndex++) {
                lockedStates.push(doc.layers[layerIndex].locked);
                doc.layers[layerIndex].locked = false;
            }
            layer.visible = true;
            layer.locked = false;

            for (var pageIndex = 0; pageIndex < data.pages.length; pageIndex++) {
                var page = doc.pages[pageIndex];
                var pageData = data.pages[pageIndex];
                var pageWidth = page.bounds[3] - page.bounds[1];
                var pageHeight = page.bounds[2] - page.bounds[0];
                var scaleX = pageWidth / pageData.width;
                var scaleY = pageHeight / pageData.height;
                var tables = collectTables(page, layer);
                var answerBoxes = collectAnswerBoxes(page, layer);
                var tableCopies = {};
                var tableWrites = {};
                var previousTablePlacement = null;
                var operations = pageData.operations || [];

                for (var operationIndex = 0; operationIndex < operations.length; operationIndex++) {
                    var operation = operations[operationIndex];
                    if (operation.enabled === false) continue;
                    processed++;
                    if (operation.kind !== "text" || !operation.text) {
                        unsupported++;
                        previousTablePlacement = null;
                        continue;
                    }

                    var parsed = parseGridPrefix(operation);
                    var placement = null;
                    var questionLine = isQuestionLine(operation.text);
                    if (parsed.glyphs.length) {
                        placement = locateGridPlacement(
                            operation, parsed, tables, scaleX, scaleY, tableWrites,
                            previousTablePlacement
                        );
                    }

                    if (placement && !questionLine) {
                        var copy = null;
                        try {
                            copy = getTableCopy(
                                placement.table, tableCopies, layer, createdItems
                            );
                        } catch (_) {}
                        if (!copy) {
                            createLooseTextFrame(
                                page, layer, operation, textStyle, answerBoxes,
                                pageWidth, pageHeight, scaleX, scaleY, createdItems
                            );
                            looseFrames++;
                            unresolved.push(operation.id);
                            previousTablePlacement = null;
                            continue;
                        }

                        for (var glyphIndex = 0; glyphIndex < parsed.glyphs.length; glyphIndex++) {
                            var sourceCell = placement.cells[glyphIndex];
                            var copyCell = findCopyCell(copy, sourceCell.row, sourceCell.column);
                            if (!copyCell) throw new Error("Could not find copied table cell for " + operation.id + ".");
                            copyCell.contents = parsed.glyphs[glyphIndex].text;
                            styleSolutionCell(copyCell, cellStyle);
                            tableWrites[cellKey(placement.table, sourceCell)] = true;
                            tableCharacters++;
                        }

                        if (parsed.continuationIndex >= 0) {
                            var continuation = trailingOperationText(operation, parsed.continuationIndex);
                            if (continuation) {
                                createContinuationFrame(
                                    page, layer, operation, continuation, placement, copy, textStyle,
                                    pageWidth, pageHeight, scaleX, scaleY, createdItems
                                );
                                continuations++;
                            }
                        }
                        previousTablePlacement = {
                            placement: placement,
                            copy: copy,
                            lastGlyphX: scaledGlyphCenterX(
                                parsed.glyphs[parsed.glyphs.length - 1], scaleX
                            )
                        };
                    } else if (placement && questionLine) {
                        copy = getTableCopy(placement.table, tableCopies, layer, createdItems);
                        createLooseTextFrame(
                            page, layer, operation, textStyle, answerBoxes,
                            pageWidth, pageHeight, scaleX, scaleY, createdItems, placement, copy
                        );
                        looseFrames++;
                        previousTablePlacement = null;
                    } else if (!parsed.glyphs.length && previousTablePlacement &&
                            operationSharesTableRow(operation, previousTablePlacement.placement, scaleY)) {
                        createContinuationFrame(
                            page, layer, operation, normalizeText(operation.text),
                            previousTablePlacement.placement, previousTablePlacement.copy, textStyle,
                            pageWidth, pageHeight, scaleX, scaleY, createdItems
                        );
                        continuations++;
                    } else {
                        createLooseTextFrame(
                            page, layer, operation, textStyle, answerBoxes,
                            pageWidth, pageHeight, scaleX, scaleY, createdItems
                        );
                        looseFrames++;
                        if (parsed.glyphs.length && !isQuestionLine(operation.text)) unresolved.push(operation.id);
                        previousTablePlacement = null;
                    }
                }
            }

            try { finalizeFrameAppearance(doc, createdItems); } catch (_) {}
            removeItems(oldItems);
        } catch (error) {
            removeItems(createdItems);
            if (AUTOMATED) throw error;
            alert("Import failed. No previous SOLUTIONS items were removed.\n\n" + error, TITLE);
            return;
        } finally {
            doc.viewPreferences.horizontalMeasurementUnits = oldH;
            doc.viewPreferences.verticalMeasurementUnits = oldV;
            doc.viewPreferences.rulerOrigin = oldOrigin;
            for (var restoreIndex = 0; restoreIndex < lockedStates.length &&
                    restoreIndex < doc.layers.length; restoreIndex++) {
                try { doc.layers[restoreIndex].locked = lockedStates[restoreIndex]; } catch (_) {}
            }
            try { layer.locked = false; } catch (__) {}
        }

        if (!AUTOMATED) {
            alert(
                "Solutions import completed.\n\n" +
                "Characters placed in cells: " + tableCharacters + "\n" +
                "Word continuations: " + continuations + "\n" +
                "Ordinary text frames: " + looseFrames + "\n" +
                "Grid-like operations left loose: " + unresolved.length + "\n" +
                "Non-text annotations needing review: " + unsupported + "\n\n" +
                "All previous SOLUTIONS-layer items were replaced.",
                TITLE
            );
        }
    }

    function readJson(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) {
            notify("Could not open: " + file.fsName);
            return null;
        }
        var raw = file.read().replace(/^\uFEFF/, "");
        file.close();
        try {
            if (typeof JSON !== "undefined" && JSON.parse) return JSON.parse(raw);
            return eval("(" + raw + ")");
        } catch (error) {
            notify("Could not parse the selected JSON.\n\n" + error);
            return null;
        }
    }

    function notify(message) {
        if (AUTOMATED) throw new Error(message);
        alert(message, TITLE);
    }

    function ensureLayer(doc) {
        var layer = doc.layers.itemByName(LAYER_NAME);
        if (!layer.isValid) layer = doc.layers.add({name: LAYER_NAME});
        layer.visible = true;
        layer.locked = false;
        return layer;
    }

    function ensureSolutionSwatch(doc) {
        var swatch = doc.colors.itemByName(SWATCH_NAME);
        if (!swatch.isValid) {
            swatch = doc.colors.add({
                name: SWATCH_NAME,
                model: ColorModel.PROCESS,
                space: ColorSpace.CMYK,
                colorValue: [100, 73, 0, 0]
            });
        }
        return swatch;
    }

    function readTypography(data) {
        var allowed = {"Arial": true, "Noto Sans": true, "Times New Roman": true};
        var family = data.settings && allowed[data.settings.font_family]
            ? data.settings.font_family : "Noto Sans";
        var size = data.settings ? Number(data.settings.point_size) : 14;
        if (size !== 12 && size !== 14) size = 14;
        return {fontFamily: family, pointSize: size};
    }

    function resolveFont(family) {
        var font;
        try {
            font = app.fonts.itemByName(family + "\tRegular");
            if (font.isValid) return font;
        } catch (_) {}
        for (var index = 0; index < app.fonts.length; index++) {
            try {
                font = app.fonts[index];
                if (String(font.fontFamily) === family &&
                        String(font.fontStyleName).toLowerCase() === "regular") return font;
            } catch (__) {}
        }
        return null;
    }

    function ensureParagraphStyle(doc, name, swatch, font, pointSize, centered) {
        var style = doc.paragraphStyles.itemByName(name);
        if (!style.isValid) style = doc.paragraphStyles.add({name: name});
        style.appliedFont = font;
        try { style.fontStyle = font.fontStyleName; } catch (_) {}
        style.pointSize = pointSize;
        style.leading = pointSize;
        style.fillColor = swatch;
        style.spaceBefore = 0;
        style.spaceAfter = 0;
        style.baselineShift = 0;
        if (centered) style.justification = Justification.CENTER_ALIGN;
        return style;
    }

    function getNoneCharacterStyle(doc) {
        var style;
        try {
            style = doc.characterStyles.itemByName("$ID/[None]");
            if (style.isValid) return style;
        } catch (_) {}
        try {
            style = doc.characterStyles.itemByName("[None]");
            if (style.isValid) return style;
        } catch (__) {}
        return doc.characterStyles[0];
    }

    function applyNoneCharacterStyle(text) {
        try {
            if (noneCharacterStyle && noneCharacterStyle.isValid) {
                text.appliedCharacterStyle = noneCharacterStyle;
            }
        } catch (_) {}
    }

    function confirmPageNames(doc, data) {
        if (!data.document || !data.document.page_names) return true;
        var mismatches = [];
        for (var index = 0; index < doc.pages.length; index++) {
            if (String(doc.pages[index].name) !== String(data.document.page_names[index])) {
                mismatches.push((index + 1) + ": " + doc.pages[index].name +
                    " / " + data.document.page_names[index]);
                if (mismatches.length === 5) break;
            }
        }
        if (!mismatches.length) return true;
        return confirm(
            "Some InDesign page names differ from the IDML used for extraction.\n\n" +
            mismatches.join("\n") + "\n\nContinue using PDF page order?"
        );
    }

    function countEnabledOperations(data) {
        var count = 0;
        for (var pageIndex = 0; pageIndex < data.pages.length; pageIndex++) {
            var operations = data.pages[pageIndex].operations || [];
            for (var operationIndex = 0; operationIndex < operations.length; operationIndex++) {
                if (operations[operationIndex].enabled !== false) count++;
            }
        }
        return count;
    }

    function collectLayerItems(layer) {
        var items = layer.allPageItems;
        var result = [];
        for (var index = 0; index < items.length; index++) result.push(items[index]);
        return result;
    }

    function removeItems(items) {
        for (var index = items.length - 1; index >= 0; index--) {
            try { if (items[index].isValid) items[index].remove(); } catch (_) {}
        }
    }

    function collectTables(page, solutionLayer) {
        var items = page.allPageItems;
        var tables = [];
        for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
            var frame = items[itemIndex];
            try {
                if (frame.constructor.name !== "TextFrame" || !frame.tables.length) continue;
                if (frame.itemLayer && frame.itemLayer.id === solutionLayer.id) continue;
                if (Math.abs(frame.absoluteRotationAngle) > 0.001 ||
                        Math.abs(frame.absoluteShearAngle) > 0.001) continue;
                for (var tableIndex = 0; tableIndex < frame.tables.length; tableIndex++) {
                    var geometry = buildTableGeometry(frame, tableIndex, page);
                    if (geometry) tables.push(geometry);
                }
            } catch (_) {}
        }
        return tables;
    }

    function buildTableGeometry(frame, tableIndex, page) {
        var table = frame.tables[tableIndex];
        var actualCells = table.cells.everyItem().getElements();
        if (!actualCells.length) return null;
        var cells = [];
        var rows = {};
        var minX = Number.MAX_VALUE;
        var maxX = -Number.MAX_VALUE;
        var minY = Number.MAX_VALUE;
        var maxY = -Number.MAX_VALUE;

        for (var cellIndex = 0; cellIndex < actualCells.length; cellIndex++) {
            var cell = actualCells[cellIndex];
            var row = Number(cell.parentRow.index);
            var column = Number(cell.parentColumn.index);
            var point = cell.insertionPoints[0];
            var centerX = Number(point.horizontalOffset);
            var baseline = Number(point.baseline);
            var width = Number(cell.width);
            var height = Number(cell.height);
            if (!isFinite(centerX) || !isFinite(baseline) || !isFinite(width) || !isFinite(height)) continue;
            var record = {
                cell: cell,
                row: row,
                column: column,
                centerX: centerX,
                baseline: baseline,
                width: width,
                height: height,
                left: centerX - width / 2,
                right: centerX + width / 2
            };
            cells.push(record);
            if (!rows[row]) rows[row] = [];
            rows[row].push(record);
            minX = Math.min(minX, record.left);
            maxX = Math.max(maxX, record.right);
            minY = Math.min(minY, baseline - height);
            maxY = Math.max(maxY, baseline + height * 0.35);
        }
        for (var rowKey in rows) {
            if (!rows.hasOwnProperty(rowKey)) continue;
            rows[rowKey].sort(function (first, second) {
                return first.column - second.column;
            });
        }
        return {
            key: String(frame.id) + ":" + tableIndex,
            frame: frame,
            table: table,
            tableIndex: tableIndex,
            page: page,
            cells: cells,
            rows: rows,
            minX: minX,
            maxX: maxX,
            minY: minY,
            maxY: maxY
        };
    }

    function parseGridPrefix(operation) {
        var glyphs = operation.glyphs || [];
        var prefix = [];
        var continuationIndex = -1;
        var consumedCharacters = 0;
        var index = 0;
        if (glyphs.length >= 2 && String(glyphs[0].text) === "R" &&
                String(glyphs[1].text) === ":") {
            prefix.push({
                text: "R:",
                bounds: [
                    glyphs[0].bounds[0], glyphs[0].bounds[1],
                    glyphs[1].bounds[2], glyphs[1].bounds[3]
                ]
            });
            consumedCharacters = 2;
            index = 2;
        }
        for (; index < glyphs.length; index++) {
            var text = String(glyphs[index].text);
            if (/^\s+$/.test(text)) continue;
            if (isGridCharacter(text) || isStandaloneGridLetter(glyphs, index)) {
                prefix.push({text: text, bounds: glyphs[index].bounds});
                consumedCharacters += text.length;
            } else {
                continuationIndex = consumedCharacters;
                break;
            }
        }
        return {glyphs: prefix, continuationIndex: continuationIndex};
    }

    function isGridCharacter(text) {
        return /^[0-9,.;:+<>=\-\u2013\u2212]$/.test(String(text));
    }

    // A single letter may be an answer token in a maths grid (for example a,
    // b, or c). A run of adjacent letters is prose and remains a loose frame.
    function isStandaloneGridLetter(glyphs, index) {
        var text = String(glyphs[index].text);
        if (!/^[A-Za-z\u00C0-\u024F]$/.test(text)) return false;
        var previous = index > 0 ? String(glyphs[index - 1].text) : "";
        var next = index + 1 < glyphs.length ? String(glyphs[index + 1].text) : "";
        return !/^[A-Za-z\u00C0-\u024F]$/.test(previous) &&
            !/^[A-Za-z\u00C0-\u024F]$/.test(next);
    }

    function isQuestionLine(text) {
        return /^\s*\d+[.)]\s*[A-Z\u00C0-\u024F]/.test(String(text || ""));
    }

    function locateGridPlacement(operation, parsed, tables, scaleX, scaleY, writes, previous) {
        var firstBounds = scaledBounds(parsed.glyphs[0].bounds, scaleX, scaleY);
        var x = (firstBounds[1] + firstBounds[3]) / 2;
        var operationBounds = scaledBounds(operation.bounds, scaleX, scaleY);
        var mixed = parsed.continuationIndex >= 0;
        var y = mixed ? operationBounds[0] : (operationBounds[0] + operationBounds[2]) / 2;
        var sequential = locateSequentialPlacement(
            operation, parsed, previous, x, scaleX, scaleY, writes
        );
        if (sequential) return sequential;
        var best = null;

        for (var tableIndex = 0; tableIndex < tables.length; tableIndex++) {
            var table = tables[tableIndex];
            if (x < table.minX - 18 || x > table.maxX + 18 ||
                    y < table.minY - 24 || y > table.maxY + 24) continue;
            for (var rowKey in table.rows) {
                if (!table.rows.hasOwnProperty(rowKey) || !table.rows[rowKey].length) continue;
                var rowCells = table.rows[rowKey];
                var baseline = rowCells[0].baseline;
                var rowDistance = Math.abs(y - baseline);
                var startIndex = nearestCellIndex(rowCells, x);
                if (startIndex < 0 || startIndex + parsed.glyphs.length > rowCells.length) continue;
                var conflict = false;
                for (var glyphIndex = 0; glyphIndex < parsed.glyphs.length; glyphIndex++) {
                    if (writes[cellKey(table, rowCells[startIndex + glyphIndex])]) {
                        conflict = true;
                        break;
                    }
                }
                if (conflict) continue;
                var xDistance = Math.abs(x - rowCells[startIndex].centerX);
                var score = rowDistance + xDistance * 0.2;
                if (!best || score < best.score) {
                    best = {
                        table: table,
                        row: Number(rowKey),
                        startIndex: startIndex,
                        score: score,
                        rowDistance: rowDistance,
                        cells: rowCells.slice(startIndex, startIndex + parsed.glyphs.length)
                    };
                }
            }
        }
        if (!best) return null;
        var rowHeight = best.cells[0].height;
        if (best.rowDistance > Math.max(rowHeight * 0.85, 14)) return null;
        return best;
    }

    function locateSequentialPlacement(operation, parsed, previous, firstGlyphX,
            scaleX, scaleY, writes) {
        if (!previous || !previous.placement || !isFinite(previous.lastGlyphX) ||
                !operationSharesTableRow(operation, previous.placement, scaleY)) return null;
        var prior = previous.placement;
        var rowCells = prior.table.rows[prior.row];
        if (!rowCells || !rowCells.length) return null;
        var startIndex = prior.startIndex + prior.cells.length;
        if (startIndex < 0 || startIndex + parsed.glyphs.length > rowCells.length) return null;
        var sourceGap = firstGlyphX - previous.lastGlyphX;
        var cellWidth = Number(rowCells[startIndex].width);
        if (sourceGap <= 0 || sourceGap > Math.max(cellWidth * 1.8, 30)) return null;
        for (var index = 0; index < parsed.glyphs.length; index++) {
            if (writes[cellKey(prior.table, rowCells[startIndex + index])]) return null;
        }
        return {
            table: prior.table,
            row: prior.row,
            startIndex: startIndex,
            score: 0,
            rowDistance: 0,
            cells: rowCells.slice(startIndex, startIndex + parsed.glyphs.length)
        };
    }

    function scaledGlyphCenterX(glyph, scaleX) {
        if (!glyph || !glyph.bounds) return NaN;
        return (Number(glyph.bounds[1]) + Number(glyph.bounds[3])) / 2 * scaleX;
    }

    function nearestCellIndex(cells, x) {
        var bestIndex = -1;
        var bestDistance = Number.MAX_VALUE;
        for (var index = 0; index < cells.length; index++) {
            var distance = Math.abs(x - cells[index].centerX);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        }
        if (bestIndex >= 0 && bestDistance <= Math.max(cells[bestIndex].width, 18)) return bestIndex;
        return -1;
    }

    function cellKey(table, cell) {
        return table.key + ":" + cell.row + ":" + cell.column;
    }

    function getTableCopy(source, tableCopies, layer, createdItems) {
        if (tableCopies[source.key] && tableCopies[source.key].isValid) {
            return tableCopies[source.key];
        }
        var copy = source.frame.duplicate(layer);
        if (!copy || !copy.isValid) return null;
        copy.fillColor = getNoneSwatch(app.activeDocument);
        copy.strokeColor = getNoneSwatch(app.activeDocument);
        copy.strokeWeight = 0;
        copy.textFramePreferences.insetSpacing = [0, 0, 0, 0];
        copy.textFramePreferences.verticalJustification = VerticalJustification.TOP_ALIGN;

        try {
            retainOnlyTable(copy, source.tableIndex);
        } catch (error) {
            try { copy.remove(); } catch (_) {}
            throw new Error("InDesign could not isolate source table " + source.key + ": " + error);
        }

        clearCopiedTable(copy.tables[0]);
        try { copy.fit(FitOptions.FRAME_TO_CONTENT); } catch (_) {}
        alignCopiedTable(source, copy);
        copy.label = GENERATED_PREFIX + "table:" + source.key;
        try { copy.sendToBack(); } catch (_) {}
        tableCopies[source.key] = copy;
        createdItems.push(copy);
        return copy;
    }

    function retainOnlyTable(frame, tableIndex) {
        if (!frame.tables.length || tableIndex >= frame.tables.length) {
            throw new Error("The copied frame does not contain the requested table.");
        }
        var table = frame.tables[tableIndex];
        var story = frame.parentStory;
        var markerIndex = Number(table.storyOffset.index);
        var lastIndex = story.characters.length - 1;
        if (lastIndex > markerIndex) {
            story.characters.itemByRange(markerIndex + 1, lastIndex).remove();
        }
        if (markerIndex > 0) {
            story.characters.itemByRange(0, markerIndex - 1).remove();
        }
        if (!frame.tables.length) throw new Error("The table was lost while trimming its story.");
    }

    function clearCopiedTable(table) {
        var cells = table.cells.everyItem().getElements();
        for (var index = 0; index < cells.length; index++) {
            try { cells[index].contents = ""; } catch (_) {
                try { cells[index].texts[0].contents = ""; } catch (__) {}
            }
        }
    }

    function alignCopiedTable(source, copy) {
        try {
            var sourceCell = source.table.cells[0];
            var copyCell = copy.tables[0].cells[0];
            var sourcePoint = sourceCell.insertionPoints[0];
            var copyPoint = copyCell.insertionPoints[0];
            var dx = Number(sourcePoint.horizontalOffset) - Number(copyPoint.horizontalOffset);
            var dy = Number(sourcePoint.baseline) - Number(copyPoint.baseline);
            if (isFinite(dx) && isFinite(dy)) copy.move(undefined, [dx, dy]);
        } catch (_) {}
    }

    function findCopyCell(frame, row, column) {
        if (!frame || !frame.isValid || !frame.tables.length) return null;
        var cells = frame.tables[0].cells.everyItem().getElements();
        for (var index = 0; index < cells.length; index++) {
            if (Number(cells[index].parentRow.index) === Number(row) &&
                    Number(cells[index].parentColumn.index) === Number(column)) return cells[index];
        }
        return null;
    }

    function styleSolutionCell(cell, style) {
        try { cell.paragraphs.everyItem().appliedParagraphStyle = style; } catch (_) {}
        try { applyNoneCharacterStyle(cell.texts[0]); } catch (__) {}
        try {
            cell.verticalJustification = VerticalJustification.CENTER_ALIGN;
            cell.topInset = 0;
            cell.bottomInset = 0;
            cell.leftInset = 0;
            cell.rightInset = 0;
        } catch (___) {}
    }

    function trailingOperationText(operation, gridCharacterCount) {
        var source = String(operation.text || "");
        var seen = 0;
        for (var index = 0; index < source.length; index++) {
            var character = source.charAt(index);
            if (/\s/.test(character)) continue;
            if (seen === gridCharacterCount) {
                return normalizeText(source.substring(index));
            }
            seen++;
        }
        return "";
    }

    function createContinuationFrame(page, layer, operation, text, placement, tableCopy, style,
            pageWidth, pageHeight, scaleX, scaleY, createdItems) {
        var operationBounds = scaledBounds(operation.bounds, scaleX, scaleY);
        var lastCell = placement.cells[placement.cells.length - 1];
        var left = lastCell.right + 2;
        var right = pageWidth;
        var top = Math.max(0, operationBounds[0]);
        var bottom = Math.min(pageHeight, Math.max(operationBounds[2] + 14, top + 30));
        var frame = page.textFrames.add(layer, undefined, undefined, {
            geometricBounds: [top, left, bottom, right],
            contents: text
        });
        frame.label = GENERATED_PREFIX + "continuation:" + operation.id;
        makeFrameTransparent(frame);
        frame.textFramePreferences.insetSpacing = [0, 0, 0, 0];
        frame.textFramePreferences.firstBaselineOffset = FirstBaseline.ASCENT_OFFSET;
        frame.parentStory.paragraphs[0].appliedParagraphStyle = style;
        frame.parentStory.paragraphs[0].justification = Justification.LEFT_ALIGN;
        applyNoneCharacterStyle(frame.parentStory.texts[0]);
        fitSingleLineFrame(frame, left, pageWidth, false);
        alignFrameToTableRow(frame, tableCopy, placement.row);
        createdItems.push(frame);
    }

    function createLooseTextFrame(page, layer, operation, style, answerBoxes,
            pageWidth, pageHeight, scaleX, scaleY, createdItems, rowPlacement, tableCopy) {
        var bounds = scaledBounds(operation.bounds, scaleX, scaleY);
        var target = findAnswerBox(answerBoxes, bounds);
        if (target) {
            bounds = copyBounds(target.bounds);
        } else {
            bounds[3] = Math.min(pageWidth, bounds[3] + 3);
            bounds[2] = Math.min(pageHeight, bounds[2] + 4);
            if (bounds[3] <= bounds[1]) bounds[3] = bounds[1] + 12;
            if (bounds[2] <= bounds[0]) bounds[2] = bounds[0] + 12;
        }
        var frame = page.textFrames.add(layer, undefined, undefined, {
            geometricBounds: bounds,
            contents: normalizeText(operation.text)
        });
        frame.label = GENERATED_PREFIX + "text:" + operation.id;
        makeFrameTransparent(frame);
        frame.textFramePreferences.insetSpacing = [0, 0, 0, 0];
        frame.parentStory.paragraphs[0].appliedParagraphStyle = style;
        applyNoneCharacterStyle(frame.parentStory.texts[0]);
        if (target) {
            frame.geometricBounds = copyBounds(target.bounds);
            frame.textFramePreferences.verticalJustification = VerticalJustification.CENTER_ALIGN;
        } else {
            frame.textFramePreferences.firstBaselineOffset = FirstBaseline.ASCENT_OFFSET;
            if (rowPlacement && tableCopy) {
                fitSingleLineFrame(frame, bounds[1], pageWidth, true);
                alignFrameToTableRow(frame, tableCopy, rowPlacement.row);
            } else {
                try { frame.fit(FitOptions.FRAME_TO_CONTENT); } catch (_) {}
            }
        }
        createdItems.push(frame);
    }

    function fitSingleLineFrame(frame, left, pageWidth, centered) {
        var bounds = copyBounds(frame.geometricBounds);
        bounds[1] = left;
        bounds[3] = pageWidth;
        if (bounds[2] - bounds[0] < 30) bounds[2] = bounds[0] + 30;
        frame.geometricBounds = bounds;
        var paragraph = frame.parentStory.paragraphs[0];
        paragraph.justification = Justification.LEFT_ALIGN;
        try { app.activeDocument.recompose(); } catch (_) {}
        try {
            var start = Number(frame.insertionPoints[0].horizontalOffset);
            var end = Number(frame.insertionPoints[-1].horizontalOffset);
            var width = end - start;
            if (isFinite(width) && width > 0) {
                bounds = copyBounds(frame.geometricBounds);
                bounds[3] = Math.min(pageWidth, bounds[1] + width + 2);
                frame.geometricBounds = bounds;
            }
        } catch (__) {}
        paragraph.justification = centered ? Justification.CENTER_ALIGN : Justification.LEFT_ALIGN;
        try { frame.fit(FitOptions.FRAME_TO_CONTENT); } catch (___) {}
    }

    function operationSharesTableRow(operation, placement, scaleY) {
        if (!operation.bounds || !placement || !placement.cells.length) return false;
        var centerY = (Number(operation.bounds[0]) + Number(operation.bounds[2])) / 2 * scaleY;
        return Math.abs(centerY - placement.cells[0].baseline) <=
            Math.max(placement.cells[0].height * 0.65, 11);
    }

    function alignFrameToTableRow(frame, tableCopy, row) {
        if (!frame || !frame.isValid || !tableCopy || !tableCopy.isValid ||
                !tableCopy.tables.length) return;
        var table = tableCopy.tables[0];
        var top = Number(tableCopy.geometricBounds[0]) + 0.25;
        for (var rowIndex = 0; rowIndex < row && rowIndex < table.rows.length; rowIndex++) {
            top += Number(table.rows[rowIndex].height);
        }
        var bounds = copyBounds(frame.geometricBounds);
        var height = bounds[2] - bounds[0];
        bounds[0] = top;
        bounds[2] = top + height;
        frame.geometricBounds = bounds;
    }

    function makeFrameTransparent(frame) {
        var doc = app.activeDocument;
        try { frame.textFramePreferences.autoSizingType = AutoSizingTypeEnum.OFF; } catch (_) {}
        try { frame.fillColor = getNoneSwatch(doc); } catch (__) {}
        try { frame.strokeColor = getNoneSwatch(doc); } catch (___) {}
        try { frame.strokeWeight = 0; } catch (____) {}
    }

    function finalizeFrameAppearance(doc, items) {
        var snapshots = [];
        var index;
        for (index = 0; index < items.length; index++) {
            try {
                if (!items[index].isValid || items[index].constructor.name !== "TextFrame") continue;
                snapshots.push({
                    id: items[index].id,
                    bounds: copyBounds(items[index].geometricBounds),
                    table: items[index].tables.length > 0,
                    vertical: items[index].textFramePreferences.verticalJustification
                });
            } catch (_) {}
        }
        for (index = 0; index < snapshots.length; index++) {
            var snapshot = snapshots[index];
            var frame = doc.pageItems.itemByID(snapshot.id);
            var objectStyle = snapshot.table
                ? doc.objectStyles[0] : doc.objectStyles.itemByName("Fullwidth Box");
            if (!objectStyle || !objectStyle.isValid) objectStyle = doc.objectStyles[0];
            frame.applyObjectStyle(objectStyle, true, true);
            frame = doc.pageItems.itemByID(snapshot.id);
            try { frame.textFramePreferences.autoSizingType = AutoSizingTypeEnum.OFF; } catch (__) {}
            try { frame.textFramePreferences.verticalJustification = snapshot.vertical; } catch (___) {}
            frame.geometricBounds = snapshot.bounds;
        }
    }

    function collectAnswerBoxes(page, solutionLayer) {
        var items = page.allPageItems;
        var boxes = [];
        for (var index = 0; index < items.length; index++) {
            var item = items[index];
            try {
                if (item.itemLayer && item.itemLayer.id === solutionLayer.id) continue;
                var type = item.constructor.name;
                if (type !== "Rectangle" && type !== "Oval" && type !== "Polygon" &&
                        type !== "TextFrame") continue;
                if (type === "TextFrame" && item.tables.length) continue;
                if (item.allGraphics && item.allGraphics.length) continue;
                if (Math.abs(item.absoluteRotationAngle) > 0.001 ||
                        Math.abs(item.absoluteShearAngle) > 0.001) continue;
                var bounds = copyBounds(item.geometricBounds);
                var width = bounds[3] - bounds[1];
                var height = bounds[2] - bounds[0];
                if (width < 9 || height < 9 || width > 90 || height > 70) continue;
                boxes.push({bounds: bounds, area: width * height});
            } catch (_) {}
        }
        boxes.sort(function (first, second) { return first.area - second.area; });
        return boxes;
    }

    function findAnswerBox(boxes, textBounds) {
        var x = (textBounds[1] + textBounds[3]) / 2;
        var y = (textBounds[0] + textBounds[2]) / 2;
        for (var index = 0; index < boxes.length; index++) {
            var bounds = boxes[index].bounds;
            if (x >= bounds[1] - 2.5 && x <= bounds[3] + 2.5 &&
                    y >= bounds[0] - 2.5 && y <= bounds[2] + 2.5) return boxes[index];
        }
        return null;
    }

    function getNoneSwatch(doc) {
        var none;
        try {
            none = doc.swatches[0];
            if (none.isValid && String(none.name) === "None") return none;
        } catch (_) {}
        try {
            none = doc.swatches.itemByName("$ID/None");
            if (none.isValid) return none;
        } catch (__) {}
        try {
            none = doc.swatches.itemByName("None");
            if (none.isValid) return none;
        } catch (___) {}
        return doc.swatches[0];
    }

    function scaledBounds(bounds, scaleX, scaleY) {
        return [
            Number(bounds[0]) * scaleY,
            Number(bounds[1]) * scaleX,
            Number(bounds[2]) * scaleY,
            Number(bounds[3]) * scaleX
        ];
    }

    function copyBounds(bounds) {
        return [Number(bounds[0]), Number(bounds[1]), Number(bounds[2]), Number(bounds[3])];
    }

    function normalizeText(text) {
        return String(text || "").replace(/[ \t]+/g, " ").replace(/^\s+|\s+$/g, "");
    }

    function countKeys(object) {
        var count = 0;
        for (var key in object) if (object.hasOwnProperty(key)) count++;
        return count;
    }
})();
