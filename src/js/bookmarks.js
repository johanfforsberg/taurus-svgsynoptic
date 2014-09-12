"use strict";

var Synoptic = window.Synoptic || {};

(function () {

    function Bookmarks(view, thumb) {
        this.view = view;
        this.thumb = thumb;

        var index = 1;

        var container = d3.select("#bookmarks");

        console.log("container " + container);

        var button = container
                .append("button")
                .classed("add", true)
                .text("+")
                .attr("title", "Add a bookmark to the current view.");

        button.on("click", add);

        var bookmarks = {};

        function goto(name) {
            view.zoomToBBox(bookmarks[name].bbox);
        };

        function show(name) {
            var mark = bookmarks[name];
            if (mark) {
                thumb.addMarker("bookmark", mark.bbox.x + mark.bbox.width/2,
                                mark.bbox.y + mark.bbox.height/2);
            }
        };

        function hide(name) {
            var mark = bookmarks[name];
            if (mark) {
                thumb.deleteMarker("bookmark");
            }
        };

        function remove(name) {
            console.log("remove ", name);
            var mark = bookmarks[name];
            if (mark) {
                mark.element.remove();
                thumb.deleteMarker("bookmark");
                delete bookmarks[name];
            }
        };

        function add() {
            var name = String(index++);
            var mark = container
                    .append("div")
                    .classed("bookmark", true)
                    .text(name)
                    .on("click", function () {goto(name)})
                    .on("contextmenu", function () {remove(name)})
                    .on("mouseover", function () {show(name);})
                    .on("mouseout", function () {hide(name);});
            var bbox = view.getBoundingBox();
            bbox.x = -bbox.x;
            bbox.y = -bbox.y;
            bookmarks[name] = {name: name, element: mark,
                               bbox: bbox};

        }

    }

    Synoptic.Bookmarks = Bookmarks;

})();
