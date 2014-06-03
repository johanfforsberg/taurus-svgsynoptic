"""
A Taurus widget that displays a SVG based synoptic view.
It allows navigation in the form of zooming, panning and clicking
various areas to zoom in.
"""

from collections import defaultdict
import logging
import os
from threading import Lock

from PyQt4 import QtCore, QtGui
from PyQt4.QtCore import QUrl
from PyQt4.QtWebKit import QWebView, QWebPage

from fandango import CaselessDict, CaselessDefaultDict
import panic
from taurus.qt.qtgui.panel import TaurusWidget
from taurus import Attribute

import PyTango


class JSInterface(QtCore.QObject):

    """
    Interface between python and a webview's javascript.

    All methods decorated with "pyqtSlot" on this class can be called
    from the JS side.
    """

    registered = QtCore.pyqtSignal(str, str)
    visibility = QtCore.pyqtSignal(str, bool)
    rightclicked = QtCore.pyqtSignal(str, str)
    leftclicked = QtCore.pyqtSignal(str, str)
    evaljs = QtCore.pyqtSignal(str)

    def __init__(self, frame, parent=None, activate_devices=True):

        self.frame = frame
        self.activate_devices = activate_devices

        self.registry = defaultdict(set)
        self.visible = set()

        super(JSInterface, self).__init__(parent)
        self.evaljs.connect(self.evaluate_js)  # thread safety

    def evaluate_js(self, js):
        #print js
        self.frame.evaluateJavaScript(js)

    @QtCore.pyqtSlot(str, str)
    def left_click(self, kind, name):
        self.leftclicked.emit(kind, name)

    @QtCore.pyqtSlot(str, str)
    def right_click(self, kind, name):
        self.rightclicked.emit(kind, name)

    @QtCore.pyqtSlot(str, str)
    def register(self, kind, name):
        "inform the widget about an item"
        if name not in self.registry[kind]:
            self.registry[kind].add(name)
            self.registered.emit(kind, name)

    def select(self, kind, names):
        "set an item as selected"
        self.evaljs.emit("Synoptic.unselectAll()")
        for name in names:
            self.evaljs.emit("Synoptic.select(%r, %r)" %
                             (str(kind), str(name)))

    @QtCore.pyqtSlot(str, bool)
    def visible(self, name, value=True):
        "Update the visibility of something"
        self.visibility.emit(name, value)
        # if value and name not in self.visible:
        #     self.visible.add(name)
        # elif not value and name in self.visible:
        #     self.visibility.emit(name, value)
        #     self.visible.remove(str(name))

    def load(self, svg, section=None):
        "Load an SVG file"
        if section:
            self.evaljs.emit("Synoptic.load(%r, %r)" % (svg, section))
        else:
            self.evaljs.emit("Synoptic.load(%r)" % svg)


class LoggingWebPage(QWebPage):
    """
    Use a Python logger to print javascript console messages.
    Very useful for debugging javascript...
    """
    def __init__(self, logger=None, parent=None):
        super(LoggingWebPage, self).__init__(parent)
        if not logger:
            logger = logging
        self.logger = logger

    def javaScriptConsoleMessage(self, msg, lineNumber, sourceID):
        # don't use the logger for now; too verbose :)
        print "JsConsole(%s:%d):\n\t%s" % (sourceID, lineNumber, msg)


class SynopticWidget(TaurusWidget):

    """
    A Qt widget displaying a SVG synoptic in a webview.

    Basically all interaction is handled by JS on the webview side,
    here we just connect the JS and Tango sides up.
    """

    def __init__(self, svg, registry, section=None):
        super(SynopticWidget, self).__init__()
        print "SynopticWidget", svg, section

        self.panic = panic.api()
        self.section = section
        self._setup_ui(svg)

        self.registry = registry

    def _setup_ui(self, svg):
        hbox = QtGui.QHBoxLayout(self)
        hbox.setContentsMargins(0, 0, 0, 0)
        hbox.layout().setContentsMargins(0, 0, 0, 0)
        hbox.addWidget(self._create_view(svg))
        self.setLayout(hbox)

    def _create_view(self, svg):
        view = QWebView(self)
        view.setRenderHint(QtGui.QPainter.TextAntialiasing, False)
        view.setPage(LoggingWebPage())
        view.setContextMenuPolicy(QtCore.Qt.PreventContextMenu)

        # load the HTML page that will contain the SVG
        path = os.path.dirname(os.path.realpath(__file__))
        html = QUrl(os.path.join(path, "index.html"))  # make file configurable

        def load_svg():
            self.js.load(svg, self.section)
        view.loadFinished.connect(load_svg)

        view.load(html)
        frame = view.page().mainFrame()

        self.js = JSInterface(frame)
        self.js.registered.connect(self.register)
        self.js.visibility.connect(self.listen)

        # mouse interaction signals
        self.clicked = self.js.leftclicked
        self.rightClicked = self.js.rightclicked

        # Inject JSInterface into the JS global namespace as "Widget"
        frame.addToJavaScriptWindowObject('Widget', self.js)  # confusing?

        return view

    def register(self, kind, name):
        "Connect an item in the SVG to a corresponding Tango entity"
        mapping = {
            "device": (self.registry.register_device, self._device_listener),
            "attribute": (self.registry.register_attribute, self._attribute_listener),
            #"section": (self.registry.register_section, self._section_listener),
            "alarm": (self.registry.register_alarm, self._alarm_listener)
        }
        print "adding Tango listener", kind, name
        method, listener = mapping[str(kind)]
        return method(str(name), listener, id(self))

    def listen(self, name, active=True):
        """Turn polling on/off for a registered attribute. This does nothing
        if events are used, but then there's no need... right?

        Note: we don't want to disable polling if there are other
        listeners, as presumably they are from e.g. panels. Doing that
        seems to cause trouble (and makes no sense anyway).
        """
        try:
            if active:
                # TODO: a nicer way to keep track of different listener types.
                # Ideally, there should be only one type.
                self.registry.enable_listener(name, self._attribute_listener, id(self))
                self.registry.enable_listener(name, self._device_listener, id(self))
            else:
                self.registry.disable_listener(name, self._attribute_listener, id(self))
                self.registry.disable_listener(name, self._device_listener, id(self))
        except PyTango.DevFailed as df:
            print "Failed to update listener %s: %s" % (name, df)

    ### Listeners ###

    def _device_listener(self, evt_src, evt_type, evt_value):

        if evt_type in (PyTango.EventType.PERIODIC_EVENT,
                        PyTango.EventType.CHANGE_EVENT):
            name = evt_src.getNormalName()
            if name:
                state = evt_value.value
                print "device_listener", name
                device = str(name).rsplit("/", 1)[0]
                self.js.evaljs.emit("Synoptic.setDeviceStatus('%s', '%s')" %
                                    (str(device), str(state)))
            else:
                print "***"
                print "No name for", evt_value
                print "***"

    def _attribute_listener(self, evt_src, evt_type, evt_value):

        if evt_type in (PyTango.EventType.PERIODIC_EVENT,
                        PyTango.EventType.CHANGE_EVENT):
            name = evt_src.getNormalName()
            if name:
                print "attribute_listener", name
                attr = Attribute(name)
                fmt = attr.getFormat()
                unit = attr.getUnit()
                value = evt_value.value
                if evt_value.type is PyTango._PyTango.CmdArgType.DevState:
                    value_str = str(value)  # e.g. "ON"
                else:
                    value_str = fmt % value  # e.g. "2.40e-5"
                attr_type = str(evt_value.type)
                self.js.evaljs.emit("Synoptic.setAttribute(%r, %r, %r, %r)" %
                                    (name, value_str, attr_type, unit))

    def _set_sub_alarms(self, basename):

        """Find all devices that 'belong' to an alarm and update their
        alarm status. This is a bit hacky as it depends on alarm names;
        find a better way."""

        subalarms = self.panic.get(basename + "*")
        for alarm in subalarms:
            devname = alarm.tag.replace("__", "/").replace("_", "-").upper()
            active = alarm.get_active()
            if active is not None:
                self.js.evaljs.emit(
                    "Synoptic.setSubAlarm(%r, %r, %s)" %
                    ("device", devname, str(bool(active)).lower()))

    def _alarm_listener(self, evt_src, evt_type, evt_value):
        if evt_type in (PyTango.EventType.PERIODIC_EVENT,
                        PyTango.EventType.CHANGE_EVENT):
            name = evt_src.getNormalName()
            if name:
                print "alarm_listener", name
                alarmname = str(name).rsplit("/", 1)[-1]
                value = evt_value.value
                self.js.evaljs.emit("Synoptic.setAlarm(%r, %s)" % (
                    alarmname, str(value).lower()))
                self._set_sub_alarms(alarmname)

    ### 'Public' API ###

    def zoom_to_section(self, secname):
        self.js.evaljs.emit("Synoptic.view.zoomTo('section', %r)"
                            % str(secname))

    def select_devices(self, devices):
        self.js.select('device', devices)


class Registry(object):

    """A simple registry for attribute callbacks. It makes sure that no
    duplicate callbacks are registered and also takes care to stop
    polling if all listeners are disabled.

    It should be treated as a singleton; all synoptic widgets should share
    the same one, or there will be collisions where they start disabling
    polling for each other. Not pretty.
    """

    # keep track of attributes so that we don't add multiple
    # listeners if they are used more than once
    _attribute_listeners = CaselessDefaultDict(set)
    _alarm_listeners = CaselessDefaultDict(set)

    _disabled_listeners = CaselessDefaultDict(set)

    lock = Lock()

    def register_device(self, devname, listener, widget):
        try:
            attrname = "%s/State" % str(devname)
            if widget in self._attribute_listeners[attrname]:
                return
            attr = Attribute(attrname)
            self._attribute_listeners[attrname].add(widget)
            attr.addListener(listener)
        except PyTango.DevFailed as df:
            print "Failed to register device %s: %s" % (devname, df)

    def register_attribute(self, attrname, listener, widget):
        try:
            if widget in self._attribute_listeners[attrname]:
                return
            attr = Attribute(attrname)
            self._attribute_listeners[attrname].add(widget)
            attr.addListener(listener)
            print("Registered attribute %s" % attrname)
        except PyTango.DevFailed as df:
            print "Failed to register attribute %s: %s" % (attrname, df)

    def register_section(self, secname):
        pass

    def register_alarm(self, alarmname, listener, widget):
        """
        The name of the alarm should be the (beginning of) a device name
        with "-" replaced by "_" and "/" by "__".
        """
        try:
            devname = self.panic.get_configs(alarmname)[alarmname]["Device"]
            attrname = "%s/%s" % (devname, alarmname)
            attr = Attribute(attrname)
            attr.addListener(listener)
            print("Registered alarm %s" % alarmname)
        except PyTango.DevFailed as df:
            print "Failed to register alarm %s: %s" % (alarmname, df)

    def _is_disabled(self, attrname, widget):
        return (widget in self._attribute_listeners[attrname] and
                widget in self._disabled_listeners[attrname])

    def disable_listener(self, attrname, listener, widget):
        with self.lock:
            if not self._is_disabled(attrname, widget):
                self._disabled_listeners[attrname].add(widget)
                # check if anybody is currently interested in the attribute
                # and if not, we stop polling it
                if (len(self._disabled_listeners[attrname]) ==
                    len(self._attribute_listeners[attrname])):
                    Attribute(attrname).disablePolling()

    def enable_listener(self, attrname, listener, widget):
        with self.lock:
            if self._is_disabled(attrname, widget):
                Attribute(attrname).enablePolling()
                self._disabled_listeners[attrname].remove(widget)
