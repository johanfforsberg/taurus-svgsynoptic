"use strict";

var Synoptic = window.Synoptic || {};

// Mock widget (for when we have no python backend)
var Widget = window.Widget || {

    left_click: function (kind, name) {
        console.log("left_click");
        if (kind === "section")
            Synoptic.view.zoomTo(kind, name);
        if (kind === "device")
            Synoptic.selectDevice(name);
    },
    right_click: function () {console.log("rightclick");},
    set_listening: function () {}
};


(function () {

    // do whatever pruning and rewriting is needed to make the SVG image work
    // better for our purposes.
    function sanitizeSvg (svg) {

        // Setup all the layers that should be user selectable
        var layers = svg.selectAll("svg > g > g")
                .filter(function () {
                    return d3.select(this).attr("inkscape:groupmode") == "layer";})
                .attr("id", function () {
                    return d3.select(this).attr("inkscape:label");})  // ugh
                .attr("display", null)
                .style("display", null);

        // Set which layers are selectable
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
                if (match) {
                    var level = parseInt(match[1]);
                    console.log("zoom level", name, level);
                    node.classed("zoom", true);
                    node.classed("level"+level, true);
                }
            });

        if (svg.select("g").attr("transform"))
            console.log("*Warning* there is a transform on the 'main' layer/group in the SVG. " +
                        "This is likely to mess up positioning of some things.");


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

    // Set the SVG file up for interaction with the Tango side
    function register (svg) {

        // go through the svg and find all <desc> elements containing
        // definitions like e.g. "device=x/y/z". For those found we set
        // the class and data of the parent element accordingly.
        // This makes it convenient to use D3.js to iterate over things.
        var pattern = /^(device|attribute|section|alarm)=(.*)/;

        //svg.call(tooltip);

        svg.selectAll("desc")
            .each(function () {
                var lines = this.textContent.split("\n"),
                    data = {};
                lines.forEach(function (line) {
                    var match = pattern.exec(line);
                    if (match) {
                        var kind = match[1].trim(), name = match[2].trim();
                        data[kind] = name;
                        if (kind == "device") {
                            // For devices, we assume that the "status" attribute
                            // is interesting. This saves a lot of typing.
                            data.attribute = name + "/State";
                        }
                    }
                }, this);
                if (data) setupNode(this, data);
            });;

        updateActive(svg);
    }

    // Setup the interactivity
    function setupNode(node, data) {
        console.log("setupNode "+ JSON.stringify(data));
        // We really want the parent node of the <desc>
        var sel = d3.select(node.parentNode)
                .classed(data)
                .data([data])
                // mouse interactions
                .on("mouseover", showTooltip)
                .on("mousemove", moveTooltip)
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

    // === Tooltip helpers ===

    // Template for the tooltip
    var tooltip_content = Handlebars.compile(
        "<table>" +
            "{{#if device}}" +
               '<tr><td class="label">Device:</td><td class="value">{{device}}</td></tr>' +
               '<tr><td class="label">State:</td><td class="value">{{value}}</td></tr>' +
            "{{else}}" +
                "{{#if attribute}}" +
                   '<tr><td class="label">Attribute:</td><td class="value">{{attribute}}</td></tr>' +
                   '<tr><td class="label">Value:</td><td class="value">{{value}}</td></tr>' +
                "{{/if}}" +
            "{{/if}}" +
            "{{#if section}}" +
                '<tr><td class="label">Section:</td><td class="value">{{section}}</td></tr>' +
            "{{/if}}" +
        "</table>"
    );

    var tooltip = d3.select("#synoptic div.tooltip");

    function showTooltip(info) {
        tooltip
            .html(function () {return tooltip_content(info);})
            //.html(info.attribute || info.section || "Not defined")
            .style("visibility", "visible");
    }

    function moveTooltip() {
        // try to maximize the odds that the tooltip fits on screen...
        if (d3.event.clientX > window.innerWidth/2) {
            tooltip
                .style("left", d3.event.clientX - 10 - tooltip.node().clientWidth)
                .style("top", d3.event.clientY + 10);
        } else {
            tooltip
                .style("left", d3.event.clientX + 10)
                .style("top", d3.event.clientY + 10);
        }
    }

    function hideTooltip() {
        tooltip
            .style("visibility", "hidden");
    }

    // ====

    // return nodes corresponding to a given kind ("device", "attribute", etc)
    // and name (e.g. device/attribute name).
    function getNodes(kind, name) {
        return d3.selectAll("#synoptic svg ." + kind)
            .filter(function (d) {return d[kind] == name;});
    }

    // Set the state class of a device
    var states = ["UNKNOWN", "INIT", "RUNNING", "MOVING",
                  "ON", "OFF", "INSERT", "EXTRACT", "OPEN", "CLOSE",
                  "STANDBY", "ALARM", "FAULT", "DISABLE"];
    function getStateClasses(state) {
        var classes = {};
        states.forEach(function (s) {
            classes["state-" + s] = s == state;
        });
        return classes;
    };
    var no_state_classes = getStateClasses();

    // Set an attribute value
    function updateAttribute(event) {

        var attrname = event.model,
            value_str = event.html,
            unit = event.unit,
            type = event.type;

        var sel = getNodes("attribute", attrname);

        if (type == "DevBoolean") {
            var value = parseFloat(value_str) !== 0.0,
                classes = {"boolean-true": value, "boolean-false": !value};
            sel.classed(classes);
        } else if (type == "DevState") {
            // Treat the "State" attribute specially
            sel.classed(getStateClasses(value_str));
        } else {
            sel.text(value_str + (unit? " " + unit: ""));
        }
        // A bit of a hack...
        var d = sel.datum();
        if (d) {
            d["value"] = value_str;
            d["unit"] = unit;
        }
    };


    // Set an attribute value
    function setAttribute(attrname, value_str, type, unit) {

        console.log("setAttribute");

        var sel = getNodes("attribute", attrname);

        if (type == "DevBoolean") {
            var value = parseFloat(value_str) !== 0.0,
                classes = {"boolean-true": value, "boolean-false": !value};
            sel.classed(classes);
        } else if (type == "DevState") {
            // Treat the "State" attribute specially
            sel.classed(getStateClasses(value_str));
        } else {

            sel.text(value_str + (unit? " " + unit: ""));
        }
        // A bit of a hack...
        var d = sel.datum();
        d["value"] = value_str;
        d["unit"] = unit;
    };

    function setDeviceState(devname, value) {
        var sel = getNodes("device", devname);
        sel.classed(getStateClasses(value));
        var d = sel.datum();
        d["state"] = value;
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
        d3.selectAll("#synoptic .selection")
            .remove();
    }

    // visually mark something as "selected"
    function select(kind, name) {

        var node = getNodes(kind, name).node(),
            parent = node.parentNode,
            bbox = util.transformedBoundingBox(node);

        d3.select(parent)
            //.insert("svg:rect", function () {return node;})
            .insert("svg:ellipse", function () {return node;})
            .attr("cx", bbox.x + bbox.width/2)
            .attr("cy", bbox.y + bbox.height/2)
            .attr("rx", bbox.width * 0.75)
            .attr("ry", bbox.height * 0.75)
            .classed("selection", true);
    }


    // Check which things are in view and need to get updates
    function _updateActive (svg, bbox) {

        var inside = [], outside = [];

        // TODO: Do this in a smarter way...

        // make sure all is disabled in non-selected layers
        svg.selectAll(".layer:not(.active) .attribute.active, " +
                      ".layer:not(.active) .device.active ")
            .classed(no_state_classes)
            .classed("active", false)
            .each(function (d) {
                outside.push(d.attribute);
            });

        // disable stuff in invisible zoom levels
        svg.selectAll(".layer.active > .zoom:not(.active) .attribute.active, " +
                      ".layer.active > .zoom:not(.active) .device.active")
            .classed(no_state_classes)
            .classed("active", false)
            .each(function (d) {
                outside.push(d.attribute);
            });

        // finally enable things that are in view
        svg.selectAll(".layer.active > .zoom.active .attribute, " +
                      ".layer.active > .zoom.active .device, " +
                      "#background > .zoom.active .attribute, " +
                      "#background > .zoom.active .device")
            .classed("active", function (d) {
                var visible = isInView(this, bbox);
                if (visible) {
                    inside.push(d.attribute);
                } else {
                    outside.push(d.attribute);
                }
                return visible;
            })
            .each(function (d) {
                var sel = d3.select(this);
                if (!sel.classed("active"))
                    sel.classed(no_state_classes);
            });

        // get rid of duplicates
        inside = _.uniq(inside);
        outside = _.uniq(outside);

        // don't unsubscribe things also in view
        // (there can be several instances)
        Tango.unsubscribe(_.without(outside, inside), updateAttribute);
        Tango.subscribe(inside, updateAttribute);
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
        vbox = vbox || bbox;
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
    Synoptic.setDeviceState = setDeviceState;
    Synoptic.setAlarm = setAlarm;
    Synoptic.setSubAlarm = setSubAlarm;
    Synoptic.unselectAll = unselectAll;
    Synoptic.select = select;

})();
