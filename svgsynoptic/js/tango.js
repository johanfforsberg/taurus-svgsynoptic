window.Tango = window.Tango || (function () {

    function getAttributeName(model) {
        return model.split("/")[3];
    }

    function getDeviceName(model) {
        var parts = model.split("/");
        return parts[0] + "/" + parts[1] + "/" + parts[2];
    }

    var debug_content = Handlebars.compile(
        "Listeners (press D to hide)" +
        '<table>' +
            '<thead>' +
                '<tr><td>Attribute</td><td>l</td>' +
                '<td>&Delta;t</td><td>c</td></tr>' +
            '</thead><tbody>' +
            '{{#each subs}}' +
                "<tr><td>{{model}}</td><td>{{callbacks}}</td>" +
                "<td>{{last_event}}</td><td>{{config}}</td></tr>" +
            "{{/each}}" +
            "<tbody>" +
        "</table>"
    );

    var debug = d3.select("#debug");
    var debug2 = d3.select("#debug2");
    var debug_interval;
    function toggleDebug() {
        if (debug_interval) {
            console.log("hide debug");
            clearInterval(debug_interval);
            debug_interval = null;
            debug.style("display", "none");
            debug2.style("display", "none");
        } else {
            console.log("start debug");
            debug_interval = setInterval(function () {
                var subs = _.map(subscriptions, function (cbs, model) {
                    var time = (last_events[model]?
                                Math.round((new Date).getTime()/1000 - last_events[model].time) : "-");
                    return {model: model, callbacks: cbs.length,
                            last_event: time,
                            config: model_config[model]? true: false};
                });
                debug.html(debug_content({subs: subs}));
            }, 1000);
            debug.style("display", "block");
            debug2.style("display", "block");
        }
    }
    window.addEventListener("keydown", function (event) {
        console.log(event.which);
        var char = String.fromCharCode(event.keyCode || event.which);
        if (event.which === 68) {
            toggleDebug();
        }
    });

    function debugMessage(msg) {
        console.log(msg);
        debug2.html(msg);
    }

    // setup the websocket communication

    //var ws = new WebSocket("ws://localhost:8888/taurus");
    var es;
    var subscribe_url, unsubscribe_url, subscriptions = {};
    function setupSSE () {
        if (es) es.close();
        es = new EventSource("/listen");
        console.log("es", es);

        es.onopen = function () {
            console.log("SSE connection established");
        };

        // temporary listener to setup URLs
        es.onmessage = function (message) {
            var event = JSON.parse(message.data);
            console.log("event", event);
            if (event.subscribe_url) {
                subscriptions = {};
                subscribe_url = event.subscribe_url;
                unsubscribe_url = event.unsubscribe_url;
                es.onmessage = onmessage;  // replace hook

                //setTimeout(function () {es.close();}, 10000);
                // Now it's safe to load the SVG and start setting up subscribers
                Synoptic.load("/images/maxiv.svg");
                //Synoptic.load("/images/test-pysvg2.svg");
                //Synoptic.load("/images/example.svg");
                //Synoptic.load("/images/femtomax.svg");
            }
        };

        es.onerror = function(e){
            console.log('SSE Error', e);
            // Try to establish a new session after a while
            setTimeout(setupSSE, 5000);
        };

    }

    // "Widget" will be connected to the Taurus widget if we're
    // running in Qt.

    // make this better
    if (!Widget.visible)
        setupSSE();

    function subscribe (models) {
        if (Widget.visible) {
            models.forEach(function (model) {
                Widget.visible(model, true);
            });
        } else {
            d3.json(subscribe_url)
                .header("Content-Type", "application/json")
                .post(JSON.stringify({models: models}));
        }
    }

    function unsubscribe (models) {
        if (Widget.visible) {
            models.forEach(function (model) {
                Widget.visible(model, false);
            });
        } else {
            d3.json(unsubscribe_url)
                .header("Content-Type", "application/json")
                .post(JSON.stringify({models: models}));
        }
    }

    function updateSubscriptions(subs, unsubs) {
        if (Widget.visible) {
            subs.forEach(function (model) {
                Widget.visible(model, true);
            });
            unsubs.forEach(function (model) {
                Widget.visible(model, false);
            });
        } else {
            d3.json(unsubscribe_url)
                .header("Content-Type", "application/json")
                .post(JSON.stringify({models: models}));
        }
    }

    var model_config = {}, last_events = {};

    // "real" onmessage hook
    var onmessage = function (message) {

        if (message.data)
            var events = JSON.parse(message.data);
        else
            var events = JSON.parse(message);
        var obsolete = [];

        events.forEach(function (event) {
            if (event.event_type == "value") {
                var callbacks = subscriptions[event.model];
                if (callbacks) {
                    if (event.model in model_config) {
                        // add stored config information to the event
                        _.defaults(event, model_config[event.model]);
                    }
                    callbacks.forEach(function (cb) {
                        cb(event);
                    });
                    last_events[event.model] = event;
                } else {
                    obsolete.push(event.model);
                }
            // store configuration events for later use
            } else if (event.event_type == "config") {
                model_config[event.model] = event;
            } else if (event.event_type == "error") {
                // handle errors!
            }
        });
    };

    // batch (un)subscribing once per second
    // This may be overcomplicating things...
    // setInterval(function () {
    //     var models;
    //     if (to_register.length > 0) {
    //         models = to_register.slice();
    //         to_register = [];
    //         subscribe(models);
    //     }
    //     if (to_unregister.length > 0) {
    //         models = to_unregister.slice();
    //         unsubscribe(models);
    //         to_unregister = [];
    //     }
    // }, 1000);

    return {

        // ask the server to give us updates on a list of models
        subscribe: function (models, callback, single) {
            // "single" means this subscription should replace all others
            // with the same callback. So first remove all occurances.
            if (single) {
                _.forEach(subscriptions, function (cbs, model) {
                    _.remove(cbs, callback);
                    if (cbs.length === 0) {
                        delete subscriptions[model];
                    }
                });
            }
            // Then we add the subscription
            var to_register = [];
            models.forEach(function (model) {
                if (model in subscriptions) {
                    if (!_.contains(subscriptions[model], callback)) {
                        subscriptions[model].push(callback);
                    }
                    to_register.push(model);
                } else {
                    subscriptions[model] = [callback];
                    to_register.push(model);
                }
            });
            // if (to_register.length > 0) {
            //     subscribe(to_register);
            //     //Synoptic.setActive(to_register, true);
            // }
            return to_register;
        },

        // stop receiving updates for models
        unsubscribe: function (models, callback) {
            var to_unregister = [];
            models.forEach(function (model) {
                if (model in subscriptions &&
                    _.contains(subscriptions[model], callback)) {

                    var cbs = _.without(subscriptions[model], callback);
                    if (cbs.length === 0) {
                        delete subscriptions[model];
                        to_unregister.push(model);
                    } else {
                        subscriptions[model] = cbs;
                    }
                }
            });
            // if (to_unregister.length > 0) {
            //     unsubscribe(to_unregister);
            //     //Synoptic.setActive(to_unregister, false);
            // }
            return to_unregister;

        },

        updateSubscriptions: function (subscribe, unsubscribe, callback) {
            updateSubscriptions(Tango.subscribe(subscribe, callback),
                                Tango.unsubscribe(unsubscribe, callback));
        },

        onmessage: onmessage,
        debugMessage: debugMessage
    };


})();
