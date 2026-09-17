/* Import reviewed Solutions Importer JSON into the active InDesign document.
 *
 * The user chooses between Advanced layout-aware placement and Simple direct
 * PDF-coordinate placement before the document is changed.
 */

#target "InDesign"

(function () {
    var TITLE = "Import Solutions";
    var TEST_JSON_PATH = $.global.__SOLUTIONS_JSON_PATH__ || "";
    var MODE_OVERRIDE = String($.global.__SOLUTIONS_IMPORT_MODE__ || "").toLowerCase();
    var LAYER_NAME = "SOLUTIONS";
    var TEXT_STYLE_NAME = "Solutions";
    var CELL_STYLE_NAME = "Cell Solutions";
    var FRAME_STYLE_NAME = "Solutions No Stroke";
    var SWATCH_NAME = "SOLUTIONS";
    var GENERATED_PREFIX = "Solutions Advanced:";
    var SIMPLE_GENERATED_PREFIX = "Solutions Simple:";
    var AUTOMATED = $.global.__SOLUTIONS_IMPORTER_AUTOMATED__ === true ||
        $.global.__SOLUTIONS_BETA_AUTOMATED__ === true ||
        $.global.__SOLUTIONS_SIMPLE_AUTOMATED__ === true;

    if (!app.documents.length) {
        notify("Open the matching InDesign chapter before running this script.");
        return;
    }

    app.doScript(run, ScriptLanguage.JAVASCRIPT, undefined,
        UndoModes.ENTIRE_SCRIPT, TITLE);

    function run() {
        var jsonFile = TEST_JSON_PATH ? File(TEST_JSON_PATH) : null;
        if (!jsonFile || !jsonFile.exists) {
            jsonFile = File.openDialog("Choose Solutions Importer JSON", "JSON:*.json");
        }
        if (!jsonFile) return;

        var data = readJson(jsonFile);
        if (!data) return;
        if (data.format !== "indesign-solutions-v2" || !data.pages ||
                typeof data.pages.length !== "number") {
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

        var mode = chooseImportMode();
        if (!mode) return;
        if (mode === "simple") {
            runSimpleImport(doc, data);
            return;
        }

        runAdvancedImport(doc, data);
    }

    function runAdvancedImport(doc, data) {
        var layer = ensureLayer(doc);
        var oldItems = collectLayerItems(layer);
        var swatch = ensureSolutionSwatch(doc);
        var typography = readTypography(data);
        var font = resolveFont(typography.fontFamily);
        if (!font) {
            notify('The selected font "' + typography.fontFamily + '" is not installed.');
            return;
        }
        var textStyle = ensureAdvancedParagraphStyle(
            doc, TEXT_STYLE_NAME, swatch, font, typography.pointSize, true
        );
        var cellStyle = ensureAdvancedParagraphStyle(
            doc, CELL_STYLE_NAME, swatch, font, typography.pointSize, true
        );
        var advancedNoneCharacterStyle = getNoneCharacterStyle(doc);

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
                                pageWidth, pageHeight, scaleX, scaleY, createdItems,
                                advancedNoneCharacterStyle
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
                            styleSolutionCell(copyCell, cellStyle, advancedNoneCharacterStyle);
                            tableWrites[cellKey(placement.table, sourceCell)] = true;
                            tableCharacters++;
                        }

                        if (parsed.continuationIndex >= 0) {
                            var continuation = trailingOperationText(operation, parsed.continuationIndex);
                            if (continuation) {
                                createContinuationFrame(
                                    page, layer, operation, continuation, placement, copy, textStyle,
                                    pageWidth, pageHeight, scaleX, scaleY, createdItems,
                                    advancedNoneCharacterStyle
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
                            pageWidth, pageHeight, scaleX, scaleY, createdItems,
                            advancedNoneCharacterStyle, placement, copy
                        );
                        looseFrames++;
                        previousTablePlacement = null;
                    } else if (!parsed.glyphs.length && previousTablePlacement &&
                            operationSharesTableRow(operation, previousTablePlacement.placement, scaleY)) {
                        createContinuationFrame(
                            page, layer, operation, normalizeText(operation.text),
                            previousTablePlacement.placement, previousTablePlacement.copy, textStyle,
                            pageWidth, pageHeight, scaleX, scaleY, createdItems,
                            advancedNoneCharacterStyle
                        );
                        continuations++;
                    } else {
                        createLooseTextFrame(
                            page, layer, operation, textStyle, answerBoxes,
                            pageWidth, pageHeight, scaleX, scaleY, createdItems,
                            advancedNoneCharacterStyle
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
                "Advanced Solutions import completed.\n\n" +
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

    function chooseImportMode() {
        if (MODE_OVERRIDE === "advanced" || MODE_OVERRIDE === "simple") {
            return MODE_OVERRIDE;
        }
        if (AUTOMATED) {
            throw new Error("Set __SOLUTIONS_IMPORT_MODE__ to advanced or simple for automated use.");
        }

        var dialog = new Window("dialog", "Import Solutions");
        dialog.orientation = "column";
        dialog.alignChildren = "fill";

        var introduction = dialog.add(
            "statictext", undefined,
            "Choose how the reviewed solutions should be placed:",
            {multiline: true}
        );
        introduction.preferredSize.width = 440;

        var choices = dialog.add("panel", undefined, "Placement mode");
        choices.orientation = "column";
        choices.alignChildren = "left";
        choices.margins = 16;

        var advanced = choices.add(
            "radiobutton", undefined,
            "Advanced: use tables, answer boxes, and continuation alignment"
        );
        advanced.value = true;

        var simple = choices.add(
            "radiobutton", undefined,
            "Simple: place text directly at its PDF coordinates"
        );

        var warning = dialog.add(
            "statictext", undefined,
            "If Advanced doesn't work as expected, undo the action and rerun the script in Simple mode.",
            {multiline: true}
        );
        warning.preferredSize.width = 440;

        var buttons = dialog.add("group");
        buttons.alignment = "right";
        buttons.add("button", undefined, "Cancel", {name: "cancel"});
        buttons.add("button", undefined, "Import", {name: "ok"});

        if (dialog.show() !== 1) return null;
        return simple.value ? "simple" : "advanced";
    }

    function runSimpleImport(doc, data) {
        var layer = ensureLayer(doc);
        var oldItems = collectGeneratedItems(layer);
        var swatch = ensureSolutionSwatch(doc);
        var typography = readTypography(data);
        var font = resolveFont(typography.fontFamily);
        if (!font) {
            notify('The selected font "' + typography.fontFamily + '" is not installed.');
            return;
        }
        var style = ensureParagraphStyle(doc, TEXT_STYLE_NAME, swatch, font,
            typography.pointSize);
        var noneCharacterStyle = getNoneCharacterStyle(doc);
        var noneSwatch = getNoneSwatch(doc);
        var frameStyle = ensureNoStrokeObjectStyle(doc, noneSwatch);

        var oldH = doc.viewPreferences.horizontalMeasurementUnits;
        var oldV = doc.viewPreferences.verticalMeasurementUnits;
        var oldOrigin = doc.viewPreferences.rulerOrigin;
        var oldLayerVisible = layer.visible;
        var oldLayerLocked = layer.locked;
        var createdItems = [];
        var progressPalette = null;
        var placed = 0;
        var skipped = 0;
        var processed = 0;
        var total = countEnabledOperations(data);

        try {
            doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
            doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.POINTS;
            doc.viewPreferences.rulerOrigin = RulerOrigin.PAGE_ORIGIN;

            progressPalette = createProgressPalette(total);
            layer.visible = true;
            layer.locked = false;
            updateProgress(progressPalette, 0, total, "Preparing Simple import...");

            for (var pageIndex = 0; pageIndex < data.pages.length; pageIndex++) {
                var page = doc.pages[pageIndex];
                var pageData = data.pages[pageIndex];
                var pdfWidth = Number(pageData.width);
                var pdfHeight = Number(pageData.height);
                if (!isFinite(pdfWidth) || !isFinite(pdfHeight) ||
                        pdfWidth <= 0 || pdfHeight <= 0) {
                    throw new Error("Invalid PDF dimensions on page " + (pageIndex + 1) + ".");
                }

                var pageWidth = page.bounds[3] - page.bounds[1];
                var pageHeight = page.bounds[2] - page.bounds[0];
                var scaleX = pageWidth / pdfWidth;
                var scaleY = pageHeight / pdfHeight;
                var operations = pageData.operations || [];

                for (var operationIndex = 0; operationIndex < operations.length; operationIndex++) {
                    var operation = operations[operationIndex];
                    if (!isEnabledOperation(operation)) continue;

                    processed++;
                    updateProgress(
                        progressPalette, processed, total,
                        "Operation " + processed + " of " + total +
                        (operation.kind === "text" ? ": placing text" : ": skipping non-text")
                    );

                    if (!isValidTextOperation(operation)) {
                        skipped++;
                        continue;
                    }

                    var bounds = scaledBounds(operation.bounds, scaleX, scaleY);
                    bounds = constrainBounds(bounds, pageWidth, pageHeight,
                        typography.pointSize);
                    var frame = page.textFrames.add(layer, undefined, undefined, {
                        geometricBounds: bounds,
                        contents: normalizeText(operation.text),
                        fillColor: noneSwatch,
                        strokeColor: noneSwatch,
                        strokeWeight: "0 pt"
                    });
                    createdItems.push(frame);
                    frame.label = SIMPLE_GENERATED_PREFIX +
                        (operation.id !== undefined ? operation.id : operationIndex);
                    applyNoStrokeObjectStyle(frame, frameStyle);
                    clearFrameInsets(frame);
                    frame.textFramePreferences.firstBaselineOffset =
                        FirstBaseline.ASCENT_OFFSET;
                    frame.parentStory.paragraphs[0].appliedParagraphStyle = style;
                    frame.parentStory.paragraphs[0].justification = Justification.LEFT_ALIGN;
                    applyNoneCharacterStyle(frame.parentStory.texts[0], noneCharacterStyle);
                    verifyFrameAppearance(frame, noneSwatch, operation.id);
                    placed++;
                }
            }

            var removalErrors = removeItems(oldItems);
            if (removalErrors.length) {
                throw new Error("Could not remove previous Simple-import items.\n" +
                    removalErrors.join("\n"));
            }
            updateProgress(progressPalette, processed, total,
                "Simple import complete.");
        } catch (error) {
            var cleanupErrors = removeItems(createdItems);
            var failure = "Import failed. Previous Simple-import items were kept.\n\n" +
                error;
            if (cleanupErrors.length) {
                failure += "\n\nSome new items could not be removed:\n" +
                    cleanupErrors.join("\n");
            }
            if (AUTOMATED) throw new Error(failure);
            alert(failure, TITLE);
            return;
        } finally {
            closeProgressPalette(progressPalette);
            doc.viewPreferences.horizontalMeasurementUnits = oldH;
            doc.viewPreferences.verticalMeasurementUnits = oldV;
            doc.viewPreferences.rulerOrigin = oldOrigin;
            try {
                layer.visible = oldLayerVisible;
            } catch (visibilityError) {
                $.writeln("Solutions Simple warning: could not restore layer visibility: " +
                    visibilityError);
            }
            try {
                layer.locked = oldLayerLocked;
            } catch (lockError) {
                $.writeln("Solutions Simple warning: could not restore layer lock: " +
                    lockError);
            }
        }

        if (!AUTOMATED) {
            alert("Simple Solutions import completed.\n\nText frames placed: " + placed +
                "\nNon-text or invalid operations skipped: " + skipped +
                "\n\nCheck the SOLUTIONS layer page by page.", TITLE);
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
        } catch (lookupError) {
            $.writeln("Solutions Simple warning: direct font lookup failed: " +
                lookupError);
        }
        for (var index = 0; index < app.fonts.length; index++) {
            try {
                font = app.fonts[index];
                if (String(font.fontFamily) === family &&
                        String(font.fontStyleName).toLowerCase() === "regular") return font;
            } catch (fontError) {
                $.writeln("Solutions Simple warning: could not inspect font " + index + ": " +
                    fontError);
            }
        }
        return null;
    }

    function ensureParagraphStyle(doc, name, swatch, font, pointSize) {
        var style = doc.paragraphStyles.itemByName(name);
        if (!style.isValid) style = doc.paragraphStyles.add({name: name});
        style.appliedFont = font;
        try {
            style.fontStyle = font.fontStyleName;
        } catch (styleFontError) {
            $.writeln("Solutions Simple warning: could not set font style: " +
                styleFontError);
        }
        style.pointSize = pointSize;
        style.leading = pointSize;
        style.fillColor = swatch;
        style.spaceBefore = 0;
        style.spaceAfter = 0;
        style.justification = Justification.LEFT_ALIGN;
        return style;
    }

    function ensureAdvancedParagraphStyle(doc, name, swatch, font, pointSize, centered) {
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
        style.justification = centered
            ? Justification.CENTER_ALIGN : Justification.LEFT_ALIGN;
        return style;
    }

    function getNoneCharacterStyle(doc) {
        var style = doc.characterStyles.itemByName("$ID/[None]");
        if (style.isValid) return style;
        style = doc.characterStyles.itemByName("[None]");
        if (style.isValid) return style;
        return null;
    }

    function applyNoneCharacterStyle(text, style) {
        if (!style || !style.isValid || !text) return;
        try {
            text.appliedCharacterStyle = style;
        } catch (error) {
            $.writeln("Solutions Simple warning: could not apply [None] character style: " +
                error);
        }
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

    function isEnabledOperation(operation) {
        return !!operation && operation.enabled !== false;
    }

    function isValidTextOperation(operation) {
        if (!isEnabledOperation(operation) || operation.kind !== "text") return false;
        if (!normalizeText(operation.text)) return false;
        if (!operation.bounds || operation.bounds.length !== 4) return false;
        for (var index = 0; index < operation.bounds.length; index++) {
            if (!isFinite(Number(operation.bounds[index]))) return false;
        }
        return true;
    }

    function countEnabledOperations(data) {
        var count = 0;
        for (var pageIndex = 0; pageIndex < data.pages.length; pageIndex++) {
            var operations = data.pages[pageIndex].operations || [];
            for (var operationIndex = 0; operationIndex < operations.length; operationIndex++) {
                if (isEnabledOperation(operations[operationIndex])) count++;
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

    function collectGeneratedItems(layer) {
        var items = layer.allPageItems;
        var result = [];
        for (var index = 0; index < items.length; index++) {
            try {
                if (String(items[index].label).indexOf(SIMPLE_GENERATED_PREFIX) === 0) {
                    result.push(items[index]);
                }
            } catch (labelError) {
                $.writeln("Solutions Simple warning: could not inspect item label: " +
                    labelError);
            }
        }
        return result;
    }

    function removeItems(items) {
        var errors = [];
        for (var index = items.length - 1; index >= 0; index--) {
            try {
                if (items[index].isValid) items[index].remove();
            } catch (error) {
                errors.push("Item " + index + ": " + error);
            }
        }
        return errors;
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
        var glyphs = expandOperationGlyphs(operation.glyphs || []);
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

    function expandOperationGlyphs(sourceGlyphs) {
        var expanded = [];
        for (var glyphIndex = 0; glyphIndex < sourceGlyphs.length; glyphIndex++) {
            var glyph = sourceGlyphs[glyphIndex];
            var text = String(glyph.text || "");
            if (text.length <= 1 || !glyph.bounds) {
                expanded.push(glyph);
                continue;
            }
            var width = (Number(glyph.bounds[3]) - Number(glyph.bounds[1])) / text.length;
            for (var textIndex = 0; textIndex < text.length; textIndex++) {
                expanded.push({
                    text: text.charAt(textIndex),
                    bounds: [
                        glyph.bounds[0],
                        Number(glyph.bounds[1]) + width * textIndex,
                        glyph.bounds[2],
                        Number(glyph.bounds[1]) + width * (textIndex + 1)
                    ]
                });
            }
        }
        return expanded;
    }

    function isGridCharacter(text) {
        return /^[0-9,.;:%+<>=\/\-\u00B1\u00B7\u00D7\u00F7\u2013\u2212\u2215\u2219\u22C5\u2260\u2264\u2265]$/.test(String(text));
    }

    // A single letter may be an answer token in a maths grid (for example a,
    // b, or c). Touching letters are prose; letters separated spatially remain
    // individual grid tokens even when PDF extraction groups them into one run.
    function isStandaloneGridLetter(glyphs, index) {
        var text = String(glyphs[index].text);
        if (!isGridLetter(text)) return false;
        return !isAdjacentGridLetter(glyphs, index, index - 1) &&
            !isAdjacentGridLetter(glyphs, index, index + 1);
    }

    function isGridLetter(text) {
        return /^[A-Za-z\u00C0-\u024F]$/.test(String(text));
    }

    function isAdjacentGridLetter(glyphs, index, neighbourIndex) {
        if (neighbourIndex < 0 || neighbourIndex >= glyphs.length ||
                !isGridLetter(glyphs[neighbourIndex].text)) return false;
        var current = glyphs[index];
        var neighbour = glyphs[neighbourIndex];
        if (!current.bounds || !neighbour.bounds) return true;
        var left = neighbourIndex < index ? neighbour : current;
        var right = neighbourIndex < index ? current : neighbour;
        var gap = Number(right.bounds[1]) - Number(left.bounds[3]);
        var leftWidth = Number(left.bounds[3]) - Number(left.bounds[1]);
        var rightWidth = Number(right.bounds[3]) - Number(right.bounds[1]);
        return gap <= Math.max(1, Math.min(leftWidth, rightWidth) * 0.35);
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

    function styleSolutionCell(cell, style, characterStyle) {
        try { cell.paragraphs.everyItem().appliedParagraphStyle = style; } catch (_) {}
        try { applyNoneCharacterStyle(cell.texts[0], characterStyle); } catch (__) {}
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
            pageWidth, pageHeight, scaleX, scaleY, createdItems, characterStyle) {
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
        applyNoneCharacterStyle(frame.parentStory.texts[0], characterStyle);
        fitSingleLineFrame(frame, left, pageWidth, false);
        alignFrameToTableRow(frame, tableCopy, placement.row);
        createdItems.push(frame);
    }

    function createLooseTextFrame(page, layer, operation, style, answerBoxes,
            pageWidth, pageHeight, scaleX, scaleY, createdItems, characterStyle, rowPlacement, tableCopy) {
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
        applyNoneCharacterStyle(frame.parentStory.texts[0], characterStyle);
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

    function ensureNoStrokeObjectStyle(doc, none) {
        var style = doc.objectStyles.itemByName(FRAME_STYLE_NAME);
        if (!style.isValid) style = doc.objectStyles.add({name: FRAME_STYLE_NAME});
        try {
            style.enableFill = true;
            style.fillColor = none;
            style.enableStroke = true;
            style.strokeColor = none;
            style.strokeWeight = "0 pt";
        } catch (error) {
            throw new Error("Could not configure the no-stroke object style: " + error);
        }
        return style;
    }

    function applyNoStrokeObjectStyle(frame, style) {
        try {
            frame.applyObjectStyle(style, true, true);
        } catch (error) {
            throw new Error("Could not apply the no-stroke object style: " + error);
        }
    }

    function getNoneSwatch(doc) {
        var names = ["$ID/None", "None"];
        var errors = [];
        try {
            names.push(app.translateKeyString("$ID/None"));
        } catch (translationError) {
            errors.push("translation: " + translationError);
        }
        for (var index = 0; index < names.length; index++) {
            try {
                var none = doc.swatches.itemByName(names[index]);
                if (none.isValid) return none;
                errors.push(names[index] + " is not valid");
            } catch (error) {
                errors.push(names[index] + ": " + error);
            }
        }
        throw new Error("Could not find the InDesign None swatch. " +
            errors.join("; "));
    }


    function verifyFrameAppearance(frame, none, operationId) {
        var errors = [];
        var strokeWeight = Number(frame.strokeWeight);
        if (!isFinite(strokeWeight) || Math.abs(strokeWeight) > 0.001) {
            errors.push("stroke weight is " + frame.strokeWeight);
        }
        try {
            if (!frame.strokeColor.isValid || frame.strokeColor.id !== none.id) {
                errors.push("stroke colour is " + frame.strokeColor.name);
            }
        } catch (strokeError) {
            errors.push("could not verify stroke colour: " + strokeError);
        }
        try {
            if (!frame.fillColor.isValid || frame.fillColor.id !== none.id) {
                errors.push("fill colour is " + frame.fillColor.name);
            }
        } catch (fillError) {
            errors.push("could not verify fill colour: " + fillError);
        }
        if (errors.length) {
            throw new Error("Frame appearance verification failed for " +
                (operationId || "an unlabelled operation") + ".\n" +
                errors.join("\n"));
        }
    }

    function clearFrameInsets(frame) {
        try {
            frame.textFramePreferences.insetSpacing = [0, 0, 0, 0];
        } catch (insetError) {
            throw new Error("Could not set zero text-frame insets: " + insetError);
        }
    }

    function createProgressPalette(total) {
        var palette = new Window("palette", TITLE);
        palette.orientation = "column";
        palette.alignChildren = "fill";
        palette.margins = 16;
        palette.statusText = palette.add("statictext", undefined,
            "Preparing Simple import...");
        palette.statusText.preferredSize.width = 360;
        palette.progressBar = palette.add("progressbar", undefined, 0,
            Math.max(1, total));
        palette.progressBar.preferredSize.width = 360;
        palette.show();
        return palette;
    }

    function updateProgress(palette, value, total, status) {
        if (!palette) return;
        palette.progressBar.value = value;
        palette.statusText.text = status;
        try {
            palette.update();
        } catch (updateError) {
            $.writeln("Solutions Simple warning: could not redraw progress palette: " +
                updateError);
        }
        try {
            app.processTasks();
        } catch (taskError) {
            $.writeln("Solutions Simple warning: could not process palette events: " +
                taskError);
        }
    }

    function closeProgressPalette(palette) {
        if (!palette) return;
        try {
            palette.close();
        } catch (closeError) {
            $.writeln("Solutions Simple warning: could not close progress palette: " +
                closeError);
        }
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

    function constrainBounds(bounds, pageWidth, pageHeight, pointSize) {
        var minimumHeight = Math.min(pageHeight, Math.max(1, pointSize + 2));
        var minimumWidth = Math.min(pageWidth, 12);
        bounds[0] = clamp(bounds[0], 0,
            Math.max(0, pageHeight - minimumHeight));
        bounds[1] = clamp(bounds[1], 0,
            Math.max(0, pageWidth - minimumWidth));
        bounds[2] = clamp(Math.max(bounds[2], bounds[0] + minimumHeight),
            bounds[0] + minimumHeight, pageHeight);
        bounds[3] = clamp(Math.max(bounds[3], bounds[1] + minimumWidth),
            bounds[1] + minimumWidth, pageWidth);
        return bounds;
    }

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    function normalizeText(text) {
        return String(text || "").replace(/[ \t]+/g, " ").replace(/^\s+|\s+$/g, "");
    }
})();
