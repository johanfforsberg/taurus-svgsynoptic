"use strict";

var Synoptic = window.Synoptic || {};


(function () {

    var zoom_to_duration = 750, max_zoom = 40;

    // Setup view interactions and insert the SVG into the page
    function View(svg, section) {

        var zoom, width, height, container, cont_width, cont_height, scale0;
        svg.classed("view", true);  // is this class ever used?

        // This signal will be dispatched (with a bbox) whenever the
        // view changes
        var changed = this.changed = new signals.Signal();

        var bbox = svg.select("g").node();
        //console.log("bbox", bbox.getBBox());

        // original svg size
        width = parseInt(svg.attr("width"));
        height = parseInt(svg.attr("height"));

        // container element
        container = d3.select("#synoptic .container");
        cont_width = container.node().offsetWidth;
        cont_height = container.node().offsetHeight;
        console.log("cont", cont_width, cont_height);

        // set the SVG to take up all of the element no matter what
        svg.attr("width", cont_width);
        svg.attr("height", cont_height);

        // viewbox need to be set in order for scaling to be correct
        svg.attr("viewBox", "0 0 " +  cont_width + " " + cont_height);

        // maximally zoomed out scale
        scale0 = Math.min(cont_width / width, cont_height / height);

        // Callback for when the window sixe changes.
        // Updates stuff that depends on the size of the container
        var updateSize = function () {
            var old_w = cont_width,
                old_scale = zoom.scale(),
                old_transl = zoom.translate();

            cont_width = container.node().offsetWidth,
            cont_height = container.node().offsetHeight;
            scale0 = Math.min(cont_width / width, cont_height / height);

            svg.attr("width", cont_width);
            svg.attr("height", cont_height);
            svg.attr("viewBox", "0 0 " +  cont_width + " " + cont_height);

            var new_scale = old_scale * cont_width / old_w;

            // TODO: the view should still be centered too
            zoom.scale(new_scale)
                .translate([old_transl[0] * new_scale / old_scale,
                            old_transl[1] * new_scale / old_scale])
                .scaleExtent([scale0, max_zoom * scale0]);
            zoom.event(svg);
        };
        window.addEventListener("resize", updateSize);

        // callback to update scale and translation when the user
        // zooms or pans the view.
        var old_zoom_level = -1;
        function onZoomed () {

            var translate = d3.event.translate,
                scale = d3.event.scale;

            // Update the view
            svg.select("g")
                .attr("transform",
                      "translate(" + translate + ")" +
                      "scale(" + scale + ")");

            // Hide/show things based on zoom level
            var z = Math.ceil(scale / scale0 - 0.1);
            switch(true) {
            case z === 1:
                zoom_level = 0;
                break;
            case z < 10:
                zoom_level = 1;
                break;
            default:
                zoom_level = 2;
            }

            var zoom_level;
            if (zoom_level != old_zoom_level) {

                var cls = ".level" + zoom_level,
                    sel = svg.selectAll("g .zoom");

                console.log("zoom", cls);
                sel.filter(":not("+cls+")")
                    .transition().duration(400)  // nice "fade out" effect
                    .attr("opacity", 0)
                    .each("end", function () {
                        d3.select(this).classed("active", false);});
                sel.filter(cls)
                    .classed("active", true)
                    .style("display", "block")
                    .transition().duration(400)  // fade in
                    .attr("opacity", 1);

                // if (zoom_level === 0) {
                //     zoomToBBox({x: 0, y: 0, width: width, height: height});
                // }
            }
            old_zoom_level = zoom_level;

            setTimeout(function () {changed.dispatch(getBoundingBox())}, 1);
        }

        // setup mouse zoom behavior
        zoom = d3.behavior.zoom()
            .scaleExtent([scale0, max_zoom * scale0])  // zoom limits
            .size([cont_width, cont_height])
            .on("zoom", onZoomed);

        function setZoom (bbox) {
            var scale = Math.min(cont_width / bbox.width,
                                 cont_height / bbox.height),
                translate = [cont_width / 2 - scale * (bbox.x + bbox.width / 2),
                             cont_height / 2 - scale * (bbox.y + bbox.height / 2)];
            console.log("setZoom", bbox, scale);
            console.log("scale", scale);
            console.log("translate", translate, cont_width, cont_height);
            return zoom.scale(scale).translate(translate); //.scale(scale);
        };

        svg.call(zoom);

        // Set the initial zoom
        setZoom({x: 0, y: 0, width: width, height: height});
        zoom.event(svg);

        // Insert the SVG into the page
        container.node().appendChild(svg.node());

        // zoom the view to fit the given bounding box (SVG space))
        function zoomToBBox (bbox, duration) {
            var z = setZoom(bbox);
            svg.transition()  //.ease("linear")
                .duration(duration || zoom_to_duration)
                .call(z.event);
        };
        this.zoomToBBox = zoomToBBox;

        // Pan and zoom the view to show the given node
        this.zoomTo = function (cls, data, padding) {
            var bbox = util.transformedBoundingBox(getNode(cls, data));
            padding = padding || 0.1;
            bbox.x -= bbox.width * padding/2;
            bbox.y -= bbox.height * padding/2;
            bbox.width *= 1 + padding;
            bbox.height *= 1 + padding;
            zoomToBBox(bbox);
        };

        // Pan the view to the given coordinates (SVG space)
        this.panTo = function (x, y) {

            var lx = cont_width/2 - x * zoom.scale(),
                ly = cont_height/2 - y * zoom.scale();

            svg.transition()
                .duration(zoom_to_duration)
                .call(zoom.translate([lx, ly]).event);
        };

        // return the first node that matches class and data
        var getNode = function (cls, data) {
            console.log("getNode " + cls + " " + data);
            var sel = svg
                    .selectAll("." + cls)
                    .filter(function (d) {console.log(d[cls]);
                                          return d[cls] == data;});
            return sel.node();
        };

        // get the transformed bounding box of the current view
        function getBoundingBox () {
            var scale = zoom.scale(), translate = zoom.translate();
            var node = svg.select("#frame").node();
            if (node)
                util.transformedBoundingBox(node);
            return {
                x: translate[0] / scale,
                y: translate[1] / scale,
                width: cont_width / scale,
                height: cont_height / scale
            };
        };
        this.getBoundingBox = getBoundingBox;

        // immediately zoom to the section if given
        if (section) {
            this.zoomTo("section", section);
        }

    };

    Synoptic.View = View;

})();
