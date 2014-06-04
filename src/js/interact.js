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

    // do whatever pruning is needed to make the SVG image work
    // better.
    function sanitizeSvg (svg) {

        // Setup all the layers that should be user selectable
        var layers = svg.selectAll("svg > g > g")
                .filter(function () {
                    return d3.select(this).attr("inkscape:groupmode") == "layer";})
                .attr("id", function () {
                    return d3.select(this).attr("inkscape:label");})  // ugh
                .attr("display", null)
                .style("display", null);

        // TODO: find a better way to do this; it relies on inkscape
        // specific tags and hardcoding layer names is not nice either!
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
        var pattern = /^(device|attribute|section|alarm)=(.*)/;

        svg.selectAll("desc")
            .each(function () {
                var lines = this.textContent.split("\n"),
                    data = {};
                lines.forEach(function (line) {
                    var match = pattern.exec(line);
                    if (match) {
                        var kind = match[1], name = match[2];
                        data[kind] = name;
                        // register with widget side
                        Widget.register(kind, name);
                    }
                }, this);
                if (data) setupNode(this, data);
            });;

    }

    function setupNode(node, data) {
        // We really want the parent node of the <desc>
        console.log("setupNode "+ Object.keys(data));
        var sel = d3.select(node.parentNode)
            .classed(data)
            .data([data])
        // mouse interactions
            .on("mouseover", showTooltip)
            .on("mousemove", updateTooltip)
            .on("mouseout", hideTooltip)
            .on("click", function () {
                if (d3.event.defaultPrevented) return;
                Object.keys(data).forEach(function (kind) {
                    Widget.left_click(kind, data[kind]);
                });
            })
            .on("contextmenu", function () {
                if (d3.event.defaultPrevented) return;
                Object.keys(data).forEach(function (kind) {
                    Widget.right_click(kind, data[kind]);
                });
            });
    }

    function showTooltip(info) {
        d3.select("#synoptic div.tooltip")
            .html(function (d) {
                return (info.device? "device: " + info.device + "<br>" : "") +
                    (info.attribute? "attribute: " + info.attribute + "<br>" : "") +
                    (info.section? "section: " + info.section + "<br>" : "");
                })
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
        return d3.selectAll("#synoptic svg ." + kind)
            .filter(function (d) {return d[kind] == name;});
    }

    // Set the status class of a device
    var statuses = ["UNKNOWN", "INIT", "RUNNING", "MOVING",
                    "ON", "OFF", "INSERT", "EXTRACT", "OPEN", "CLOSE",
                    "STANDBY", "ALARM", "FAULT", "DISABLE"];
    function getStatusClasses(status) {
        var classes = {};
        statuses.forEach(function (s) {
            classes["status-" + s] = s == status;
        });
        return classes;
    };

    // Set an attribute value
    function setAttribute(attrname, value_str, type, unit) {

        var sel = getNodes("attribute", attrname);

        if (type == "DevBoolean") {
            var value = parseFloat(value_str) !== 0.0,
                classes = {"boolean-true": value, "boolean-false": !value};
            sel.classed(classes);
        } else if (type == "DevState") {
            // Treat the "Status" attribute specially
            sel.classed(getStatusClasses(value_str));
        } else {
            sel.text(value_str + (unit? " " + unit: ""));
        }
    };

    function setDeviceStatus(devname, value) {
        var sel = getNodes("device", devname);
        sel.classed(getStatusClasses(value));
    };


    // find the name of the layer where a node belongs
    function getNodeLayer(node) {
        var parent = node.parentNode;
        while (!d3.select(parent).classed("layer")) {
            parent = parent.parentNode;
        }
        return d3.select(parent);
    }


    function sendLayerAlarmEvent(node, name, value) {
        // Not sure this is a great idea, but anyway; let's send out a
        // custom DOM event on the layer node every time an alarm is
        // activated within. The point is to decouple things a bit.
        var layer = getNodeLayer(node);
        var alarmEvent = new CustomEvent("alarm", {
            detail: {origin: name, active: value,
                     layername: layer.attr("id")}
        });
        layer.node().dispatchEvent(alarmEvent);
    }

    // Set an alarm
    function setAlarm(alarmname, value) {
        var sel = getNodes("alarm", alarmname);
        sel.classed("active", value);

        if (sel.node()) {
            sendLayerAlarmEvent(sel.node(), alarmname, value);
        }
    }

    // Kind of a hack...
    function setSubAlarm(kind, name, value) {
        var sel = getNodes(kind, name)
            .classed("alarm", value)
            .classed("active", value);
        console.log("setSubAlarm " + name + " " + sel);

        if (sel.node()) {
            sendLayerAlarmEvent(sel.node(), name, value);
        }
    }

    // remove all visual selections
    function unselectAll() {
        d3.selectAll("#synoptic rect.selection")
            .remove();
    }

    // visually mark a device as "selected"
    function select(kind, name) {

        var node = getNodes(kind, name).node(),
            parent = node.parentNode,
            bbox = util.transformedBoundingBox(node);

        d3.select(parent)
            .insert("svg:rect", function () {return node;})
            .attr(bbox)
            .classed("selection", true);
    }

    // Check which things are in view and need to get updates
    function _updateActive (svg, bbox) {

        console.log("updateActive");

        // TODO: Do this in a smarter way...

        // make sure all is disabled in non-selected layers
        svg.selectAll(".layer:not(.active) .attribute, .layer:not(.active) .device ")
            .classed("active", false)
            .each(function (d) {
                Widget.visible(d.attribute || (d.device + "/State"), false);
            });

        // disable stuff in invisible zoom levels
        svg.selectAll(".layer.active > .zoom:not(.active) .attribute, .layer.active > .zoom:not(.active) .device")
            .classed("active", false)
            .each(function (d) {
                Widget.visible(d.attribute || (d.device + "/State"), false);
            });

        // finally enable things that are in view
        svg.selectAll(".layer.active > .zoom.active .attribute, .layer.active > .zoom.active .device")
            .classed("active", function (d) {
                var visible = isInView(this, bbox);
                Widget.visible(d.attribute || (d.device + "/State"), visible);
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
    Synoptic.setDeviceStatus = setDeviceStatus;
    Synoptic.setAlarm = setAlarm;
    Synoptic.setSubAlarm = setSubAlarm;
    Synoptic.unselectAll = unselectAll;
    Synoptic.select = select;

})();
