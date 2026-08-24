/* Import positioned solution text into the active Adobe InDesign document.
 * Input: JSON downloaded from Taktik Robot's Solutions tool.
 */

#target "InDesign"

function importSolutionText() {
    var LAYER_NAME = "SOLUTIONS";
    var STYLE_NAME = "Solutions";
    var FRAME_PAD_X = 3;
    var FRAME_PAD_BOTTOM = 4;

    if (app.documents.length === 0) {
        alert("Open the chapter InDesign document before running this script.");
        return;
    }

    var jsonFile = File.openDialog("Choose extracted solution-text JSON", "JSON:*.json");
    if (!jsonFile) return;
    jsonFile.encoding = "UTF-8";
    if (!jsonFile.open("r")) {
        alert("Could not open: " + jsonFile.fsName);
        return;
    }
    var raw = jsonFile.read();
    jsonFile.close();
    // Some InDesign ExtendScript versions do not expose the standard JSON object.
    // Remove a possible UTF-8 BOM before parsing.
    raw = raw.replace(/^\uFEFF/, "");

    var data;
    try {
        if (typeof JSON !== "undefined" && JSON.parse) {
            data = JSON.parse(raw);
        } else {
            // The JSON is produced locally by Taktik Robot. Parentheses
            // force object-literal parsing in legacy ExtendScript engines.
            data = eval("(" + raw + ")");
        }
    } catch (error) {
        alert(
            "The selected file could not be parsed as solution JSON.\n" +
            jsonFile.fsName + "\n\n" + error
        );
        return;
    }
    if (data.format !== "indesign-solution-text-v1" || !data.pages) {
        alert("This is not solution-text JSON produced by the extractor.");
        return;
    }

    var doc = app.activeDocument;
    if (data.pages.length !== doc.pages.length) {
        alert(
            "Page-count mismatch.\n\nJSON: " + data.pages.length +
            " pages\nInDesign document: " + doc.pages.length +
            " pages\n\nSplit both PDFs to exactly the pages in this chapter, then extract again."
        );
        return;
    }

    var style = doc.paragraphStyles.itemByName(STYLE_NAME);
    if (!style.isValid) {
        alert('Paragraph style "' + STYLE_NAME + '" does not exist in this document.');
        return;
    }

    var totalRuns = 0;
    for (var countPage = 0; countPage < data.pages.length; countPage++) {
        totalRuns += data.pages[countPage].runs.length;
    }

    var progress = new Window("palette", "Import solution text");
    progress.orientation = "column";
    progress.alignChildren = ["fill", "top"];
    progress.margins = 16;
    var progressStatus = progress.add("statictext", undefined, "Preparing import...");
    progressStatus.preferredSize.width = 330;
    var progressBar = progress.add("progressbar", undefined, 0, Math.max(totalRuns, 1));
    progressBar.preferredSize = [330, 16];
    var cancelButton = progress.add("button", undefined, "Cancel");
    cancelButton.alignment = "right";
    var cancelRequested = false;
    cancelButton.onClick = function () {
        cancelRequested = true;
        cancelButton.enabled = false;
        progressStatus.text = "Cancelling and removing imported frames...";
        progress.update();
    };
    progress.show();
    progress.update();

    var layer = doc.layers.itemByName(LAYER_NAME);
    var layerWasCreated = !layer.isValid;
    if (layerWasCreated) layer = doc.layers.add({name: LAYER_NAME});
    layer.visible = true;
    layer.locked = false;

    var oldH = doc.viewPreferences.horizontalMeasurementUnits;
    var oldV = doc.viewPreferences.verticalMeasurementUnits;
    var oldOrigin = doc.viewPreferences.rulerOrigin;
    var created = 0;
    var processed = 0;
    var createdFrames = [];
    var cancelled = false;

    try {
        doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
        doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.POINTS;
        doc.viewPreferences.rulerOrigin = RulerOrigin.PAGE_ORIGIN;

        for (var p = 0; p < data.pages.length; p++) {
            if (cancelRequested) {
                cancelled = true;
                throw new Error("__IMPORT_CANCELLED__");
            }
            var pageData = data.pages[p];
            var page = doc.pages[p];
            var pageWidth = page.bounds[3] - page.bounds[1];
            var pageHeight = page.bounds[2] - page.bounds[0];
            var scaleX = pageWidth / pageData.width;
            var scaleY = pageHeight / pageData.height;

            for (var r = 0; r < pageData.runs.length; r++) {
                if (cancelRequested) {
                    cancelled = true;
                    throw new Error("__IMPORT_CANCELLED__");
                }
                var run = pageData.runs[r];
                processed++;
                if (!run.text) continue;
                var top = run.top * scaleY;
                var left = run.x0 * scaleX;
                var right = Math.min(pageWidth, run.x1 * scaleX + FRAME_PAD_X);
                var bottom = Math.min(pageHeight, run.bottom * scaleY + FRAME_PAD_BOTTOM);
                if (right <= left) right = left + 12;
                if (bottom <= top) bottom = top + 12;

                var frame = page.textFrames.add(layer, undefined, undefined, {
                    geometricBounds: [top, left, bottom, right],
                    contents: run.text
                });
                frame.label = "Imported solution text";
                frame.textFramePreferences.insetSpacing = [0, 0, 0, 0];
                frame.textFramePreferences.firstBaselineOffset = FirstBaseline.ASCENT_OFFSET;
                frame.parentStory.paragraphs[0].appliedParagraphStyle = style;
                frame.fit(FitOptions.FRAME_TO_CONTENT);
                createdFrames.push(frame);
                created++;

                // Updating less often keeps large imports fast while allowing the
                // palette and Cancel button to remain responsive.
                if (processed % 10 === 0 || processed === totalRuns) {
                    progressBar.value = processed;
                    progressStatus.text =
                        "Page " + (p + 1) + " of " + data.pages.length +
                        "  -  " + created + " of " + totalRuns + " text frames";
                    progress.update();
                    // Yield briefly so legacy ExtendScript can repaint the palette
                    // and dispatch clicks without relying on app.redraw(), which is
                    // unavailable in some InDesign versions.
                    $.sleep(1);
                }
            }
        }
    } catch (error) {
        if (cancelled || String(error).indexOf("__IMPORT_CANCELLED__") >= 0) {
            for (var removeIndex = createdFrames.length - 1; removeIndex >= 0; removeIndex--) {
                if (createdFrames[removeIndex].isValid) createdFrames[removeIndex].remove();
            }
            if (layerWasCreated && layer.isValid) layer.remove();
        } else {
            alert("Import stopped after creating " + created + " frames.\n" + error);
            return;
        }
    } finally {
        doc.viewPreferences.horizontalMeasurementUnits = oldH;
        doc.viewPreferences.verticalMeasurementUnits = oldV;
        doc.viewPreferences.rulerOrigin = oldOrigin;
        if (progress) progress.close();
    }

    if (cancelled) {
        alert("Import cancelled. No solution text was added.");
        return;
    }

    alert(
        "Imported " + created + " solution text frames onto layer " + LAYER_NAME +
        '.\nApplied paragraph style "' + STYLE_NAME + '".'
    );
}

// Group every document change into one History/Undo operation. One Cmd/Ctrl+Z
// removes all imported frames and, when newly created, the SOLUTIONS layer.
app.doScript(
    importSolutionText,
    ScriptLanguage.JAVASCRIPT,
    undefined,
    UndoModes.ENTIRE_SCRIPT,
    "Import solution text"
);
