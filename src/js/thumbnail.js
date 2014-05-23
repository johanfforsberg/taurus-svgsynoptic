"use strict";

var Synoptic = window.Synoptic || Synoptic;

(function () {

    // Create a small "overview" of the synoptic
    function Thumbnail(view, thumb) {

        this.thumb = thumb;
        thumb.classed("thumbnail", true);

        var svg_w = thumb.attr("width"),
            svg_h = thumb.attr("height"),
            container = d3.select("#thumbnail > .container"),
            cont_w = container.node().offsetWidth,
            cont_h = cont_w * svg_h / svg_w,
            size = svg_w / cont_w,
            shown = true;

        container.style("height", cont_h);

        // insert the thumbnail into the page
        container.node().appendChild(thumb.node());

        // Add a small box that indicates the current view
        var indicator = container.append("div")
            .classed("indicator", true);

        // re-center the view on click
        function pan_to_click() {
            view.panTo(d3.event.layerX * size,
                       d3.event.layerY * size);
        };
        thumb.on("click", pan_to_click);

        // listen for resize events
        var fixSize = function () {
            cont_w = container.node().offsetWidth,
            cont_h = cont_w * svg_h / svg_w,
            size = svg_w / cont_w;

            // This is needed in order for things to work right in both
            //FF and webkit. Not sure why...
            thumb.attr("viewBox", "0 0 "+svg_w+" "+svg_h)
                .attr("width", cont_w)
                .attr("height", cont_h);

            container.style("height", cont_h);
        };
        fixSize();
        window.addEventListener("resize", fixSize);

        function updateIndicator(bbox) {
            if (shown) {
                indicator
                    .style("left", -bbox.x / size)
                    .style("top", -bbox.y / size)
                    .style("width", bbox.width / size)
                    .style("height", bbox.height / size);
            }
        }
        view.changed.add(updateIndicator);

        // setup the corner hide/show button
        d3.select("button.thumbnail").on("click", function () {
            var thumbnail = d3.select("#thumbnail");
            console.log("click thumbnail buttin " + thumbnail);
            if (thumbnail.style("display") != "none") {
                thumbnail.style("display", "none");
                shown = false;
            } else {
                thumbnail.style("display", "inline");
                shown = true;
            }
        });

    }

    Thumbnail.prototype.addMarker = function (name, x, y) {
        var marker = this.svg
            .append("circle")
            .classed("marker", true)
            .attr("cx", x)
            .attr("cy", y);

        // blink it
        window.setInterval(function () {
            marker
                .attr("r", 100)
                .attr("opacity", 1)
                .transition()
                .duration(900).ease("linear")
                .attr("r", 1000)
                .attr("opacity", 0);
        }, 3000);
    };

    Synoptic.Thumbnail = Thumbnail;


})();
