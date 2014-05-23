import os
from subprocess import Popen
import sys

from taurus.qt.qtgui.application import TaurusApplication
import PyTango

from synopticwidget import SynopticWidget
#from magnet import MagnetPanel


def main():

    import optparse
    parser = optparse.OptionParser()
    parser.add_option("-t", "--no-tango", dest="use_tango",
                      action="store_false", default=True)
    options, arguments = parser.parse_args()

    if len(sys.argv) < 2:
        sys.exit("Please give a suitable HTML file as argument.")

    progname = sys.argv[0]
    svg = arguments[0]
    section = sys.argv[2] if len(sys.argv) > 2 else None

    app = TaurusApplication(sys.argv)

    synoptic = SynopticWidget(svg, section,
                              use_tango=options.use_tango)

    db = PyTango.Database()
    open_panels = {}

    # == mouse interaction callbacks ===

    def get_magnet_circuit(mag):
        "Find the circuit a magnet belongs to"
        result = db.get_device_property(str(mag), "Circuit")
        if result["Circuit"]:
            return result["Circuit"][0]

    def get_magnet_siblings(mag):
        "Find all magnets connected to the same circuit"
        circuit = get_magnet_circuit(mag)
        if circuit:
            result = db.get_device_property(circuit, "Magnets")
            if result["Magnets"]:
                return result["Magnets"]

    def on_click(kind, name):

        print "click", kind, name

        if kind == "device":
            #siblings = get_magnet_siblings(name)
            #synoptic.select_devices(siblings)
            synoptic.select_devices([name])

        elif kind == "section":
            synoptic.zoom_to_section(name)

    def on_rightclick(kind, name):

        print "rightclick", kind, name

        if kind == "section":
            # Spawn a new, independent synoptic process (will do for now)
            devnull = open(os.devnull, 'wb')
            Popen(["nohup", "python", progname, svg, name],
                  stdout=devnull, stderr=devnull)
            # new_synoptic = SynopticWidget(svg, str(name),
            #                               use_tango=options.use_tango)
            # new_synoptic.show()

        elif kind == "device":
            # TODO: some intelligence here
            circuit = True
            if circuit:
                if name in open_panels:
                    w = open_panels[name]
                    if not w.isVisible():
                        w.show()
                    w.activateWindow()
                    w.raise_()
                else:
                    # w = MagnetPanel()
                    # w.setModel(name)
                    # w.show()
                    # open_panels[name] = w
                    pass

    synoptic.clicked.connect(on_click)
    synoptic.rightClicked.connect(on_rightclick)
    synoptic.show()

    app.exec_()


if __name__ == '__main__':
    main()
