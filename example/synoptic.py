from functools import partial
import sys
from weakref import WeakValueDictionary, proxy

from taurus.qt.qtgui.application import TaurusApplication
from taurus.qt.qtgui.panel import TaurusDevicePanel
from taurus.qt.Qt import QObject, SIGNAL
import PyTango

from svgsynoptic import SynopticWidget, Registry

"""An example of using the SVG synoptic widget."""


def main():

    import optparse
    parser = optparse.OptionParser()
    options, arguments = parser.parse_args()

    if len(sys.argv) < 2:
        sys.exit("Please give a suitable SVG file as argument.")

    svg = arguments[0]
    section = arguments[1] if len(arguments) > 1 else None

    # == helpers ==

    def makeWidget(registry, section=None):
        # create a synoptic widget
        global s
        synoptic = SynopticWidget(registry=registry)
        synoptic.setModel(svg=svg, section=section)  # section is optional
        synoptic.rightClicked.connect(partial(on_rightclick, synoptic))
        synoptic.show()
        open_synoptics[id(synoptic)] = synoptic

    # == mouse interaction callbacks ===

    def on_rightclick(synoptic, kind, name):

        if kind == "section":
            # open a new synoptic widget showing the clicked section
            makeWidget(registry, str(name))

        elif kind == "device":
            # open the appropriate panel
            devclass = PyTango.Database().get_class_for_device(str(name))
            print devclass
            show_panel(name, devclass)

        print len(open_synoptics)
        print len(open_panels)

    def show_panel(device, cls):
        "Display a GUI panel for a device"
        if device in open_panels:
            # check if the panel exists already
            print "trying to raise existing window for", cls
            w = open_panels[device]
            if not w.isVisible():
                w.show()
            w.activateWindow()
            w.raise_()
        else:
            w = TaurusDevicePanel()
            w.setModel(str(device))
            w.show()
            open_panels[device] = w

    def on_focus_changed(old, new):
        print open_panels.values()
        if new:
            window = new.window()
            if window in open_panels.values():
                name = window.windowTitle()
                for syn in open_synoptics.values():
                    syn.select_devices([name])
                    #syn.zoom_to_device(name)

    app = TaurusApplication(sys.argv)
    app.setCursorFlashTime(0)

    open_panels = WeakValueDictionary()
    open_synoptics = WeakValueDictionary()

    registry = Registry()
    makeWidget(registry, section)

    QObject.connect(app, SIGNAL("focusChanged(QWidget *, QWidget *)"), on_focus_changed)
    app.exec_()


if __name__ == '__main__':
    main()
