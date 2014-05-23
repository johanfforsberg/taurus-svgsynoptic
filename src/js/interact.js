"use strict";

var Synoptic = window.Synoptic || {};

// Mock widget (for when we have no python backend)
var Widget = window.Widget || {
    register: function (kind, dev) {console.log("register " + dev); return true;},
    left_click: function (kind, name) {
        if (kind === "section")
            Synoptic.view.zoomTo(kind, name);
        if (kind === "device")
            Synoptic.selectDevice(name);
    },
    right_click: function () {},
    set_listening: function () {}
};


(function () {

    // keep references to everything found in the SVG in here.
    // may be premature optimization...
    var _nodes = {};

    // do whatever pruning is needed to make the SVG image work
    // better.
    function sanitizeSvg (svg) {

        // Setup all the layers that should be user selectable
        var layers = svg.selectAll("svg > g > g")
                .filter(function () {
                    return d3.select(this).attr("inkscape:groupmode") == "layer";})
                .attr("display", null)
                .style("display", null);

        // TODO: find a better way to do this; it relies on inkscape specific tags
        // and hardcoding layer names is not nice either!
        layers
            .classed("layer", true);
        layers
            .filter(function () {
                var name = d3.select(this).attr("inkscape:label");
                return !_.contains(["background", "symbols"], name);})
            .classed("selectable", true);

        // activate the zoom levels (also in need of improvement)
        var zoomlevels = svg.selectAll("svg > g > g > g");
        zoomlevels
            .each(function () {
                var node = d3.select(this),
                    name = d3.select(this).attr("inkscape:label"),
                    match = /zoom(\d)/.exec(name);
                console.log("zoom level", name);
                if (match) {
                    var level = parseInt(match[1]);
                    node.classed("zoom", true);
                    node.classed("level"+level, true);
                }
            });


        // Remove inline styles from symbols, to make sure they will
        // take our class styles.
        // svg.selectAll("symbol>*")
        // svg.selectAll("#symbols > *")
        //     .style("fill", null)
        //     .attr("fill", null)
        //     .style("display", null)
        //     .style("visibility", null);

        // Find all <use> nodes and replace them with their reference.
        // This ugly hack is a workaround for qtwebkit being slow to
        // render <use> nodes in some cases (e.g. rotated
        // transforms). Hopefully this can be removed in the future.

        // svg.selectAll("use")
        //     .each(function () {util.reifyUse(svg, this);});

        // Here we might also do some checking on the supplied SVG
        // file so that it has the right format etc, and report
        // problems back.
    }

    // Register all devices, attributes, etc with the Tango side
    function register (svg) {

        // go through the svg and find all <desc> elements containing
        // definitions like e.g. "device=x/y/z". For those found we set
        // the class and data of the parent element accordingly.
        // This makes it convenient to use D3.js to iterate over things.
        var pattern = /(device|attribute|section)=(.*)/;
        svg.selectAll("desc")
            .each(function () {
                var match = pattern.exec(this.textContent);
                if (match) {
                    var kind = match[1], name = match[2];

                    // We really want the parent node of the <desc>
                    d3.select(this.parentNode)
                        .classed(kind, true)
                        .data([name])  // set node data to e.g. "a/b/c"

                    // mouse interactions
                        .on("mouseover", showTooltip)
                        .on("mousemove", updateTooltip)
                        .on("mouseout", hideTooltip)
                        .on("click", function () {
                            if (d3.event.defaultPrevented) return;
                            Widget.left_click(kind, name);
                        })
                        .on("contextmenu", function () {
                            if (d3.event.defaultPrevented) return;
                            Widget.right_click(kind, name);
                        })

                        .each(function () {_nodes[name] = this;});

                    // register with widget side
                    Widget.register(kind, name);

                }
            });;

    }

    function showTooltip(info) {
        d3.select("#synoptic div.tooltip")
            .text(info)
            .style("visibility", "visible");
    }

    function updateTooltip() {
        d3.select("#synoptic div.tooltip")
            .style("left", d3.event.clientX + 10)
            .style("top", d3.event.clientY + 10);
    }

    function hideTooltip() {
        d3.select("#synoptic div.tooltip")
            .style("visibility", "hidden");
    }

    function getNodes(kind, name) {
        return d3.selectAll("svg ." + kind)
            .filter(function (d) {return d == name;});
    }

    // Set the status class of a device
    var statuses = ["UNKNOWN", "RUNNING", "FAULT", "ON", "OFF", "IN", "OUT"];
    function getStatusClasses(status) {
        var classes = {};
        statuses.forEach(function (s) {
            classes["status-" + s] = s == status;
        });
        return classes;
    };

    // Set an attribute value
    function setAttribute(attrname, value) {

        var sel = getNodes("attribute", attrname);

        if (/.*\/status/.exec(attrname)) {
            // Treat the "Status" attribute specially
            sel.classed(getStatusClasses(value));
        } else {
            sel.text(value);
        }
    };

    // remove all visual selections
    function unselectAllDevices() {
        d3.selectAll("#synoptic rect.selection")
            .remove();
    }

    // visually mark a device as "selected"
    function selectDevice(devname) {

        var devnode = _nodes[devname],
            parent = devnode.parentNode,
            bbox = util.transformedBoundingBox(devnode);

        d3.select(parent)
            .insert("svg:rect", function () {return devnode;})
            .attr(bbox)
            .classed("selection", true);
    }

    // Check which devices are in view and need to get updates
    function _updateActive (svg, bbox) {

        console.log("updateActive");

        // TODO: Do this in a smarter way...

        svg.selectAll(".layer:not(.active)").selectAll(".attribute")
            .classed("active", false)
            .each(function (d) {
                Widget.set_listening(d, false);
            });

        svg.selectAll(".layer .zoom:not(.active)").selectAll(".attribute")
            .classed("active", false)
            .each(function (d) {
                Widget.set_listening(d, false);
            });

        svg.selectAll(".layer.active .zoom.active").selectAll(".attribute")
            .classed("active", function (d) {
                var visible = isInView(this, bbox);
                Widget.set_listening(d, visible);
                return visible;
            });
    }

    // The above could becone a bit heavy because a lot of elements
    // are looped through.  Limit update frequency a bit since it's
    // not important that this is very responsive.  Also there is no
    // point in activating and deactivating lots of devices when the
    // user is panning around quickly.
    var updateActive = _.throttle(_updateActive, 1000, {leading: false});

    // return whether a given element is currently in view
    function isInView(el, vbox) {
        var bbox = util.transformedBoundingBox(el);
        // TODO: change this so that partially visible devices are counted as visible.
        // This is done on purpose to simplify debugging for now.
        var result = (bbox.x > -vbox.x - bbox.width &&
                      bbox.y > -vbox.y - bbox.height &&
                      bbox.x < -vbox.x + vbox.width &&
                      bbox.y < -vbox.y + vbox.height);
        return result;
    }

    // make some functions globally available by attaching them to
    // the Synoptic "namespace":
    Synoptic.sanitizeSvg = sanitizeSvg;
    Synoptic.register = register;
    Synoptic.updateActive = updateActive;
    Synoptic.setAttribute = setAttribute;
    Synoptic.unselectAllDevices = unselectAllDevices;
    Synoptic.selectDevice = selectDevice;

})();
