from functools import partial
import sys

from taurus.qt.qtgui.application import TaurusApplication
from taurus.qt.qtgui.panel import TaurusDevicePanel
import PyTango

from synopticwidget import SynopticWidget, Registry

"""An example of using the SVG synoptic widget."""


def main():

    import optparse
    parser = optparse.OptionParser()
    options, arguments = parser.parse_args()

    if len(sys.argv) < 2:
        sys.exit("Please give a suitable SVG file as argument.")

    svg = arguments[0]
    section = sys.argv[2] if len(sys.argv) > 2 else None

    # == helpers ==

    def makeWidget(registry, section=None):
        # create a synoptic widget
        synoptic = SynopticWidget(svg, registry, section)
        synoptic.clicked.connect(partial(on_click, synoptic))
        synoptic.rightClicked.connect(partial(on_rightclick, synoptic))
        synoptic.show()

    # == mouse interaction callbacks ===

    def on_click(synoptic, kind, name):

        if kind == "device":
            synoptic.select_devices([name])

        elif kind == "section":
            synoptic.zoom_to_section(name)

    def on_rightclick(synoptic, kind, name):

        if kind == "section":
            # open a new synoptic widget showing the clicked section
            makeWidget(registry, str(name))

        elif kind == "device":
            # open the appropriate panel
            devclass = PyTango.Database().get_class_for_device(str(name))
            print devclass
            show_panel(name, devclass)

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

    app = TaurusApplication(sys.argv)
    app.setCursorFlashTime(0)

    open_panels = {}

    registry = Registry()
    makeWidget(registry, section)

    app.exec_()


if __name__ == '__main__':
    main()
