window.Tango = window.Tango || (function () {

    function getAttributeName(model) {
        return model.split("/")[3];
    }

    function getDeviceName(model) {
        var parts = model.split("/");
        return parts[0] + "/" + parts[1] + "/" + parts[2];
    }

    // setup the websocket communication

    //var ws = new WebSocket("ws://localhost:8888/taurus");
    var es;
    var subscribe_url, unsubscribe_url;
    setTimeout(function () {
        es = new EventSource("/listen");

        // temporary listener to setup URLs
        es.onmessage = function (message) {
            var event = JSON.parse(message.data);
            console.log("event", event);
            if (event.subscribe_url) {
                subscribe_url = event.subscribe_url;
                unsubscribe_url = event.unsubscribe_url;
                es.onmessage = onmessage;
                Synoptic.load("/images/maxiv.svg");
                //Synoptic.load("/images/test-pysvg2.svg");
                //Synoptic.load("/images/example.svg");
                //Synoptic.load("/images/femtomax.svg");
            }
        };
    });

    // "real" onmessage hook
    var onmessage = function (message) {
        var events = JSON.parse(message.data);
        if (events.length) {
            events.forEach(function (event) {
                if (event.event_type == "value") {
                    var attrname = getAttributeName(event.model);
                    //console.log(attrname, event.value);
                    // if (attrname == "State") {
                    //     Synoptic.setDeviceState(getDeviceName(event.model), event.html);
                    // } else {
                        Synoptic.setAttribute(event.model, event.html);
                    //}
                }
            });
        }
    };

    // es.onerror = function(e){
    //     console.log('SSE Error', e);
    // };

    // es.onopen = function () {
    //     // Must wait for the websocket to open before starting the
    //     // whole thing up. Would be better to load the SVG immidiately
    //     // though.
    // };

    var models_to_register = [], models_to_unregister = [];

    function subscribe (models) {

        d3.json(subscribe_url)
            .header("Content-Type", "application/json")
            .post(JSON.stringify({models: models}));
    }

    function unsubscribe (models) {
        d3.json(unsubscribe_url)
            .header("Content-Type", "application/json")
            .post(JSON.stringify({models: models}));
    }

    // batch (un)subscribing
    setInterval(function () {
        var models;
        if (models_to_register.length > 0) {
            models = models_to_register.slice();
            console.log("registering", models);
            models_to_register = [];
            subscribe(models);
        }
        if (models_to_unregister.length > 0) {
            models = models_to_unregister.slice();
            console.log("unregistering", models);
            models_to_unregister = [];
            unsubscribe(models);
        }
    }, 1000);


    return {
        // ask the server to give us updates on a model
        register: function (model) {
            // switch(kind) {
            // case "attribute":
            //     models_to_register.push(name);
            //     break;
            // case "device":
            //     models_to_register.push(name);
            //     break;
            // case "section":
            //     console.log("section");
            //     break;
            // }
            //  return true;

            models_to_register.push(model);
        },
        unregister: function (model) {
            // switch(kind) {
            // case "attribute":
            //     models_to_unregister.push(model);
            //     break;
            // case "device":
            //     models_to_unregister.push(model);
            //     break;
            // case "section":
            //     console.log("section");
            //     break;
            // }
            // return true;
            models_to_unregister.push(model);
        }
    };


})();
