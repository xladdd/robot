#target "InDesign"

(function () {
    if (app.documents.length === 0) {
        alert("Open a document and select one or more text frames.");
        return;
    }

    var selectedFrames = [];
    for (var i = 0; i < app.selection.length; i++) {
        if (app.selection[i] instanceof TextFrame) {
            selectedFrames.push(app.selection[i]);
        }
    }

    if (selectedFrames.length === 0) {
        alert("Select one or more text frames and run the script again.");
        return;
    }

    app.doScript(
        function () {
            splitFrames(selectedFrames);
        },
        ScriptLanguage.JAVASCRIPT,
        undefined,
        UndoModes.ENTIRE_SCRIPT,
        "Split Text Frames into Characters"
    );

    function splitFrames(frames) {
        var oldMeasurementUnit = app.scriptPreferences.measurementUnit;
        var newFrames = [];
        var skipped = 0;

        app.scriptPreferences.measurementUnit = MeasurementUnits.POINTS;

        try {
            // Make all character frames before removing any source frames. This is
            // important when more than one selected frame belongs to the same story.
            for (var f = 0; f < frames.length; f++) {
                var sourceFrame = frames[f];
                if (!sourceFrame.isValid) {
                    continue;
                }

                var characters = sourceFrame.characters.everyItem().getElements();

                for (var c = 0; c < characters.length; c++) {
                    var sourceCharacter = characters[c];
                    var value = sourceCharacter.contents;

                    // Remove ordinary and non-breaking spaces, tabs, paragraph
                    // returns, forced line breaks, and other whitespace characters.
                    if (isWhitespace(value)) {
                        continue;
                    }

                    try {
                        var target = makeCharacterFrame(sourceFrame, sourceCharacter);
                        newFrames.push(target);
                    } catch (characterError) {
                        skipped++;
                    }
                }
            }

            if (skipped === 0) {
                for (var r = frames.length - 1; r >= 0; r--) {
                    if (frames[r].isValid) {
                        frames[r].remove();
                    }
                }
            } else {
                // Keep the operation lossless if even one character could not be
                // reproduced. Remove the partial result and retain every source.
                for (var n = newFrames.length - 1; n >= 0; n--) {
                    if (newFrames[n].isValid) {
                        newFrames[n].remove();
                    }
                }
                newFrames = [];
            }

            if (newFrames.length > 0) {
                app.select(newFrames);
            } else {
                app.select(NothingEnum.NOTHING);
            }
        } finally {
            app.scriptPreferences.measurementUnit = oldMeasurementUnit;
        }

        if (skipped > 0) {
            alert("No source frames were changed because " + skipped + " character" +
                (skipped === 1 ? " could" : "s could") + " not be reproduced.");
        }
    }

    function makeCharacterFrame(sourceFrame, sourceCharacter) {
        var sourceX = sourceCharacter.horizontalOffset;
        var sourceBaseline = sourceCharacter.baseline;
        var sourceBounds = sourceFrame.geometricBounds;
        var destinationParent = sourceFrame.parent;
        var target = destinationParent.textFrames.add(sourceFrame.itemLayer);

        // Start with ample height. WIDTH_ONLY leaves this height unchanged, while
        // InDesign determines the required width from the character itself.
        target.geometricBounds = [
            sourceBounds[0],
            sourceX - 18,
            sourceBounds[2],
            sourceX + 18
        ];
        target.textFramePreferences.insetSpacing = [0, 0, 0, 0];
        target.textFramePreferences.autoSizingReferencePoint = AutoSizingReferenceEnum.CENTER_POINT;
        target.textFramePreferences.autoSizingType = AutoSizingTypeEnum.WIDTH_ONLY;

        // Duplicating the source character retains its paragraph style as well as
        // any local character formatting and applied character style.
        sourceCharacter.duplicate(LocationOptions.AT_BEGINNING, target.insertionPoints[0]);
        target.paragraphs[0].appliedParagraphStyle = sourceCharacter.appliedParagraphStyle;
        app.activeDocument.recompose();

        // Composition determines the true glyph position. Move the new frame so
        // that the copied character occupies the original baseline position.
        var copiedCharacter = target.characters[0];
        target.move(undefined, [
            sourceX - copiedCharacter.horizontalOffset,
            sourceBaseline - copiedCharacter.baseline
        ]);

        return target;
    }

    function isWhitespace(value) {
        if (value === undefined || value === null || value === "") {
            return true;
        }

        // ExtendScript's regular-expression support varies by InDesign version,
        // so test common InDesign whitespace codes explicitly as a fallback.
        return /\s/.test(value) ||
            value === "\u00A0" || value === "\u2002" || value === "\u2003" ||
            value === "\u2009" || value === "\u200A" || value === "\u202F" ||
            value === "\uFEFF" || value === SpecialCharacters.FORCED_LINE_BREAK ||
            value === SpecialCharacters.DISCRETIONARY_LINE_BREAK;
    }
})();
