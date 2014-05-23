"""
A Taurus widget that displays a SVG based synoptic view.
It allows navigation in the form of zooming, panning and clicking
various areas to zoom in.
"""

import logging
import os

from PyQt4 import QtCore, QtGui
from PyQt4.QtCore import QUrl
from PyQt4.QtWebKit import QWebView, QWebPage

from taurus.qt.qtgui.panel import TaurusWidget
from taurus import Attribute

import PyTango


class JSInterface(QtCore.QObject):

    """
    Interface between python and a webview's javascript.

    All methods decorated with "pyqtSlot" on this class can be called
    from the JS side.
    """

    evaljs = QtCore.pyqtSignal(str)

    def __init__(self, frame, click_signal, rightclick_signal,
                 parent=None, activate_devices=True):

        self.frame = frame
        self.click_signal = click_signal
        self.rightclick_signal = rightclick_signal
        self.activate_devices = activate_devices

        self._devices = dict()
        self._attributes = dict()
        self.selected_device = None

        super(JSInterface, self).__init__(parent)
        self.evaljs.connect(self.evaluate_js)  # thread safety

    def evaluate_js(self, js):
        print js
        self.frame.evaluateJavaScript(js)

    def device_listener(self, evt_src, evt_type, evt_value):

        #print "thread", threading.current_thread()
        if evt_type in (PyTango.EventType.PERIODIC_EVENT,
                        PyTango.EventType.CHANGE_EVENT):
            state = evt_value.value
            name = evt_src.getNormalName()

            if name:
                print "device_listener", name
                device = str(name).rsplit("/", 1)[0]
                self.evaljs.emit("Synoptic.setDeviceStatus('%s', '%s')" %
                                 (str(device), str(state)))

    def attribute_listener(self, evt_src, evt_type, evt_value):
        if evt_type in (PyTango.EventType.PERIODIC_EVENT,
                        PyTango.EventType.CHANGE_EVENT):
            name = evt_src.getNormalName()
            if name:
                print "attribute_listener", name
                fmt = self._attributes[name].getFormat()
                unit = self._attributes[name].getUnit()
                value = evt_value.value
                value_str = "%s %s" % (fmt % value, unit)
                self.evaljs.emit("Synoptic.setAttribute(%r, %r)" %
                                 (name, value_str))

    @QtCore.pyqtSlot(str, str)
    def left_click(self, kind, name):
        print "clicked", kind, name
        if self.click_signal:
            self.click_signal.emit(kind, name)

    @QtCore.pyqtSlot(str, str)
    def right_click(self, kind, name):
        print "right clicked", kind, name
        if self.rightclick_signal:
            self.rightclick_signal.emit(kind, name)

    @QtCore.pyqtSlot(str, str, result=bool)
    def register(self, kind, name):
        mapping = {
            "device": self._register_device,
            "attribute": self._register_attribute,
            "section": self._register_section
        }
        return mapping[str(kind)](str(name))

    def _register_device(self, devname):
        # TODO: Add check that the device actually exists!
        if str(devname) in self._devices:
            return True
        try:
            attr = Attribute("%s/State" % str(devname))
            self._devices[str(devname)] = attr
            #attr.addListener(self.device_listener)
            return True
        except PyTango.DevFailed as df:
            print "Failed to register device %s: %s" % (devname, df)
        return False

    def _register_attribute(self, attrname):
        if attrname in self._attributes:
            return True
        try:
            attr = Attribute(str(attrname))
            print attr.getFormat()
            self._attributes[attrname] = attr
            attr.addListener(self.attribute_listener)
            print("Registered attribute %s" % attrname)
            return True
        except PyTango.DevFailed as df:
            print "Failed to register attribute %s: %s" % (attrname, df)
        return False

    def _register_section(self, secname):
        pass

    def select_devices(self, devnames):
        self.evaljs.emit("Synoptic.unselectAllDevices()")
        for dev in devnames:
            self.evaljs.emit("Synoptic.selectDevice(%r)" % str(dev))

    @QtCore.pyqtSlot(str, bool)
    def set_listening(self, name, active=True):
        #print "thread", threading.current_thread()
        all_items = dict(list(self._devices.items()) +
                         list(self._attributes.items()))
        item = all_items.get(str(name))
        if not item:
            return
        if active and not item.isPollingEnabled():
            print "*** enable %s", name
            item.enablePolling()
        elif not active and item.isPollingEnabled():
            print "*** disable %s", name
            item.disablePolling()

    def load(self, svg, section=None):
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
    here we just connect the JS and python sides up.
    """

    clicked = QtCore.pyqtSignal(str, str)  # e.g. ('device', 'a/b/c')
    rightClicked = QtCore.pyqtSignal(str, str)

    def __init__(self, svg, section=None, use_tango=True):
        self.use_tango = use_tango
        super(SynopticWidget, self).__init__()
        print "SynopticWidget", svg, section
        self._setup_ui(svg)
        self.section = section

    def _setup_ui(self, svg):
        hbox = QtGui.QHBoxLayout(self)
        hbox.setContentsMargins(0, 0, 0, 0)
        hbox.layout().setContentsMargins(0, 0, 0, 0)
        hbox.addWidget(self.create_view(svg))
        self.setLayout(hbox)

    def create_view(self, svg, use_tango=True):
        view = QWebView(self)
        view.setRenderHint(QtGui.QPainter.TextAntialiasing, False)
        view.setPage(LoggingWebPage())
        view.setContextMenuPolicy(QtCore.Qt.PreventContextMenu)

        html = QUrl(os.path.dirname(os.path.realpath(__file__)) + "/index.html")
        view.load(html)

        frame = view.page().mainFrame()

        def load_svg():
            self.js.load(svg, self.section)

        if self.use_tango:
            self.js = JSInterface(frame, self.clicked, self.rightClicked)
            # Inject JSInterface into the JS global namespace as "Widget"
            view.loadFinished.connect(load_svg)
            frame.addToJavaScriptWindowObject('Widget', self.js)  # confusing?
        print "hej"
        return view

    def zoom_to_section(self, secname):
        self.js.evaljs.emit("Synoptic.view.zoomTo('section', %r)"
                            % str(secname))

    def select_devices(self, devices):
        self.js.select_devices(devices)
