var Synoptic = window.Synoptic || {};

(function () {

    // Start everything up
    var main = function (svg, section) {

        Synoptic.sanitizeSvg(svg);
        var svg_copy = d3.select(svg.node().cloneNode(true));
        Synoptic.register(svg);

        // Create the main view
        var view = new Synoptic.View(svg, section);
        Synoptic.view = view;

        // Create the small overview in the corner
        var thumb = new Synoptic.Thumbnail(view, svg_copy);
        //thumb.addMarker("Just a test", 5000, 2200);

        var sel = new Synoptic.LayerSelectors();
        view.changed.add(function (bb) {Synoptic.updateActive(svg, bb);});
        sel.changed.add(function () {
            Synoptic.updateActive(svg, view.getBoundingBox());
        });
    };

    // Load the actual SVG into the page
    function load (svg, section) {
        d3.xml(svg, "image/svg+xml", function(xml) {
            var svg = d3.select(document.importNode(xml.documentElement, true));
            d3.ns.prefix.inkscape = "http://www.inkscape.org/namespaces/inkscape";
            main(svg, section);
        });
    };

    Synoptic.load = load;

})();
