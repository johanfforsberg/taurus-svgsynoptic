/* Handle the buttons for selecting visibility of diffent layers */

"use strict";

var Synoptic = window.Synoptic || {};

(function () {

    // Create layer selection buttons
    function LayerSelectors () {

        // signal that something has changed
        var changed = this.changed = new signals.Signal();

        var container = d3.select("#synoptic #selectors .container"),
            layernames = [];

        // create a button for each layer in the SVG
        var layers = d3.selectAll("svg.view .layer.selectable");
        layers.each(function () {
            var name = d3.select(this).attr("inkscape:label");
            d3.select(this).attr("id", name);  // a hack to be able to
                                               // find a layer by name
            layernames.push(name);
            container.append("div")
                .classed("layer-selector", true)
                .classed(name, true)
                .text(name)
                .on("click", function () {toggleLayer(name);});

            // Each layer dispatches a custom event whenever an alarm
            // goes off inside it. We listen to it in order to mark the
            // selector button accordingly.
            this.addEventListener("alarm", onAlarm);
        });

        // show only the first layer by default
        // (should be configurable)
        layernames.forEach(hideLayer);
        showLayer(layernames[0]);

        // alarm callback to indicate that a layer has alarms
        function onAlarm (e) {
            var button = d3.select("div.layer-selector." + e.detail.layername);
            button.classed("alarm", e.detail.active);
        };

        // make a layer invisible
        function showLayer (layername) {
            var layer = layers.filter("#" + layername),
                button = d3.select("div.layer-selector." + layername);
            layer.classed("active", true);
            button.classed("active", true);
        };

        // make a layer visible
        function hideLayer (layername) {
            var layer = layers.filter("#" + layername),
                button = d3.select("div.layer-selector." + layername);
            layer.classed("active", false);
            button.classed("active", false);
        };

        // toggle the visibility of a layer
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
