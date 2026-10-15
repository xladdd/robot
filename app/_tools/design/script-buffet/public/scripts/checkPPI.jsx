#target illustrator

var doc = app.activeDocument;

if (doc.placedItems.length > 0) {
    var p = doc.placedItems[0];

    alert(
        "Width: " + p.width +
        "\nFile: " + p.file.name
    );
}