var Synoptic = window.Synoptic || {};

(function () {

    // Start everything up
    var main = function (svg, section) {

        // copy the SVG before we start doing stuff to it
        var original_svg = d3.select(svg.node().cloneNode(true));

        Synoptic.sanitizeSvg(svg);

        // create the miniature overview
        var view = new Synoptic.View(svg, section);
        view.changed.add(Synoptic.updateActive.bind(this, svg));
        Synoptic.view = view;

        Synoptic.register(svg);

        // Create the small overview in the corner
        var thumb = new Synoptic.Thumbnail(view, original_svg);
        //thumb.addMarker("Just a test", 5000, 2200);

        var sel = new Synoptic.LayerSelectors();
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
