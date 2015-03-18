"""
A Taurus widget that displays a SVG based synoptic view.
It allows navigation in the form of zooming, panning and clicking
various areas to zoom in.
"""

import json
import logging
import os
import time
from threading import Thread, Lock
from Queue import Queue, Empty
from weakref import WeakValueDictionary

from fandango import CaselessDefaultDict
import panic
from PyQt4.QtWebKit import QWebView, QWebPage
import PyTango
from taurus.qt import QtCore, QtGui, Qt
from taurus.qt.QtCore import QUrl
from taurus.qt.qtgui.panel import TaurusWidget
from taurus import Attribute
from taurus.core.taurusvalidator import AttributeNameValidator, DeviceNameValidator

from listener import TaurusWebAttribute


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
    lock = Lock()

    def __init__(self, frame, parent=None):

        self.frame = frame

        super(JSInterface, self).__init__(parent)
        self.evaljs.connect(self.evaluate_js)  # thread safety

    def evaluate_js(self, js):
        #print "JS", js
        with self.lock:
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

    def __init__(self, parent=None, *args, **kwargs):
        super(SynopticWidget, self).__init__(parent)
        self.attribute_name_validator = AttributeNameValidator()

    def setModel(self, svg, section=None):
        self._svg = svg
        self.registry = Registry()
        self.registry.start()
        self._setup_ui(svg, section)

    def getModel(self):
        return self._url

    def listen(self, name, active=True):
        ""
        if self.attribute_name_validator.isValid(name):
            if active:
                self.registry.subscribe_attribute(name, self._attribute_listener)
            else:
                self.registry.unsubscribe_attribute(name)

    def on_click(self, kind, name):
        """The default behavior is to mark a clicked device and to zoom to a clicked section.
        Override this function if you need something else."""
        if kind == "device":
            self.select_devices([name])
            self.emit(Qt.SIGNAL("graphicItemSelected(QString)"), name)
        elif kind == "section":
            self.zoom_to_section(name)

    def on_rightclick(synoptic, kind, name):
        pass

    def _setup_ui(self, url, section=None):
        hbox = QtGui.QHBoxLayout(self)
        hbox.setContentsMargins(0, 0, 0, 0)
        hbox.layout().setContentsMargins(0, 0, 0, 0)
        hbox.addWidget(self._create_view(url, section))

        self.setLayout(hbox)
        self.js.leftclicked.connect(self.on_click)
        self.js.rightclicked.connect(self.on_rightclick)


    def _create_view(self, svg, section=None):
        view = QWebView(self)
        view.setRenderHint(QtGui.QPainter.TextAntialiasing, False)
        view.setPage(LoggingWebPage())
        view.setContextMenuPolicy(QtCore.Qt.PreventContextMenu)

        # the HTML page that will contain the SVG
        path = os.path.dirname(os.path.realpath(__file__))
        html = QUrl(os.path.join(path, "index.html"))  # make file configurable

        # setup the JS interface
        frame = view.page().mainFrame()
        self.js = JSInterface(frame)
        #self.js.registered.connect(self.register)
        self.js.visibility.connect(self.listen)

        # mouse interaction signals
        self.clicked = self.js.leftclicked
        self.rightClicked = self.js.rightclicked

        # Inject JSInterface into the JS global namespace as "Widget"
        frame.addToJavaScriptWindowObject('Widget', self.js)  # confusing?

        # when the page (and all the JS) has loaded, load the SVG
        def load_svg():
            print "blorrt", svg
            self.js.load(svg, section)
        view.loadFinished.connect(load_svg)

        # load the page
        # print "url", QUrl(url)
        view.load(html)

        return view

    def _set_sub_alarms(self, basename):

        """Find all devices that 'belong' to an alarm and update their
        alarm status. This is a bit hacky as it depends on alarm names;
        find a better way."""

        subalarms = self.registry.panic.get(basename + "*")
        for alarm in subalarms:
            devname = alarm.tag.replace("__", "/").replace("_", "-").upper()
            active = alarm.get_active()
            if active is not None:
                print "subalarm on", devname, active
                self.js.evaljs.emit(
                    "Synoptic.setSubAlarm(%r, %r, %s)" %
                    ("device", devname, str(bool(active)).lower()))

    ### Listener callbacks ###

    def _device_listener(self, evt_src, evt_type, evt_value):

        if evt_type in (PyTango.EventType.PERIODIC_EVENT,
                        PyTango.EventType.CHANGE_EVENT):
            name = evt_src.getNormalName()
            if name:
                state = evt_value.value
                device = str(name).rsplit("/", 1)[0]
                self.js.evaljs.emit("Synoptic.setDeviceStatus('%s', '%s')" %
                                    (str(device), str(state)))
            else:
                print "***"
                print "No name for", evt_value
                print "***"


    def _attribute_listener(self, event):
        # TODO: seems like multiline strings need more escaping, else
        # evaljs complains about "SyntaxError: Expected token ')'"
        self.js.evaljs.emit("Tango.onmessage(%r)" % json.dumps([event]))

    def __attribute_listener(self, evt_src, evt_type, evt_value):

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
                self.js.evaljs.emit("Synoptic.setAttribute('%s', '%s', '%s', '%s')" %
                                    (name, value_str, attr_type, unit))

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
        print "zoom_to_section", secname
        self.js.evaljs.emit("Synoptic.view.zoomTo('section', %r)"
                            % str(secname))

    def zoom_to_device(self, devname):
        self.js.evaljs.emit("Synoptic.view.zoomTo('device', %r, 10)"
                            % str(devname))

    def select_devices(self, devices):
        self.js.select('device', devices)

    def closeEvent(self, event):
        "Clean things up"
        self.registry.running = False
        self.registry.join()
        del self.registry

    def sendDebugMessage(self, msg):
        self.js.evaljs.emit("Tango.debugMessage(%r)" % msg)


class Registry(Thread):

    """This is a separate thread that takes care of sub- and unsubscribing
    to attributes. This in order to keep the UI thread running smoothly event
    if we're setting up lots of listeners at once."""

    lock = Lock()

    def __init__(self):
        Thread.__init__(self)
        self.listeners = {}
        self.queue = Queue()
        # self.to_subscribe = Queue()
        # self.to_unsubscribe = Queue()

    def __del__(self):
        "Some extra freeing of stuff, to make sure"
        for listener in self.listeners.values():
            listener.clear()
        self.listeners.clear()

    def run(self):
        "Main loop. Keeps waiting for instructions."
        self.running = True
        while self.running:
            time.sleep(1.0)
            if not self.queue.empty():
                subs = dict()
                unsubs = set()
                while not self.queue.empty():
                    action, data = self.queue.get()
                    if action == "subscribe":
                        attr, callback = data
                        if attr in unsubs:
                            # unsubscribe, then subscribe again?
                            # we don't need to do anything!
                            print "***skipping unsubscribe-subscribe***"
                            unsubs.remove(attr)
                        else:
                            subs[attr] = callback
                    elif action == "unsubscribe":
                        attr = data
                        if attr in subs:
                            # subscribe, then unsubscribe; let's do nothing!
                            print "***skipping subscribe-unsubscribe***"
                            del subs[attr]
                        else:
                            unsubs.add(attr)
                for attr, callback in subs.items():
                    self._subscribe_attribute(attr, callback)
                for attr in unsubs:
                    self._unsubscribe_attribute(attr)

    def register(self, kind, name):
        "Connect an item in the SVG to a corresponding Tango entity"
        # remove

    def subscribe_attribute(self, attrname, callback):
        self.queue.put(("subscribe", (str(attrname), callback)))

    def unsubscribe_attribute(self, attrname):
        self.queue.put(("unsubscribe", (str(attrname))))

    def _subscribe_attribute(self, attrname, callback):
        if attrname not in self.listeners:
            print "subscribe", attrname,
            t0 = time.time()
            #with self.lock:
            listener = TaurusWebAttribute(attrname, callback)
            self.listeners[attrname] = listener
            print "...sub done", attrname, ", took %f s." % (time.time()-t0)

    def _unsubscribe_attribute(self, attrname):
        listener = self.listeners.pop(attrname, None)
        if listener:
            t0 = time.time()
            print "unsubscribe", attrname,
            #with self.lock:
            listener.clear()
            print "...unsub done", attrname, ", took %f s." % (time.time()-t0)


if __name__ == '__main__':
    import sys
    print sys.argv[1]
    qapp = Qt.QApplication([])
    sw = SynopticWidget()
    sw.show()
    sw.setModel(sys.argv[1])
    qapp.exec_()
