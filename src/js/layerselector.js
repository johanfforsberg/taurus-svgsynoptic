/* Handle the buttons for selecting visibility of diffent layers */

"use strict";

var Synoptic = window.Synoptic || {};

(function () {

    // Create layer selection buttons
    function LayerSelectors () {

        var changed = this.changed = new signals.Signal();

        var container = d3.select("#synoptic #selectors .container"),
            layernames = [];

        var layers = d3.selectAll("svg.view .layer.selectable");
        layers.each(function () {
            var name = d3.select(this).attr("inkscape:label");
            console.log("layer " + name);
            d3.select(this).attr("id", name);  // a hack...
            layernames.push(name);
            container.append("div")
                .classed("layer-selector", true)
                .classed(name, true)
                .text(name)
                .on("click", function () {toggleLayer(name);});
        });
        layernames.forEach(hideLayer);
        showLayer(layernames[0]);

        function showLayer (layername) {
            var layer = layers.filter("#" + layername),
                button = d3.select("div.layer-selector." + layername);
            layer.classed("active", true);
            button.classed("active", true);
        };

        function hideLayer (layername) {
            var layer = layers.filter("#" + layername),
                button = d3.select("div.layer-selector." + layername);
            layer.classed("active", false);
            button.classed("active", false);
        };

        function toggleLayer (layername) {
            var layer = layers.filter("#" + layername),
                button = d3.select("div.layer-selector." + layername);

            if (layer.classed("active")) {
                hideLayer(layername);
            } else {
                showLayer(layername);
            }

            changed.dispatch(layer);
        };

    }

    Synoptic.LayerSelectors = LayerSelectors;

})();
