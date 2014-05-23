This is a synoptic widget based on the SVG format. There is a demonstration program in the "linac" directory that can be started like so:

  cd linac/
  python synoptic.py full/path/to/maxiv.svg

Note that the widget needs to be in your PYTHONPATH, so doing "export PYTHONPATH=/full/path/to/app-maxiv-svgsynoptic/src" before may help.


=== Requirements ===

- Taurus (and Qt, PyQt, PyTango, etc)
- qtwebkit (at least under CentOS, the "qtwebkit" package is apparently not automatically installed by PyQt)


=== The SVG file ===

There are some requirements on the SVG file in order for the program to work correctly. They are subject to change.

- The SVG file must contain exactly one "top" level inkscape layer, which contains all further layers as sublayers.

- The sublayers of the main layer can be any number and will be used to create the selectable layers in the synoptic. Everything inside a layer will be visible if the layer is active, otherwise not.

- These layers are actually just SVG <g> ("group") elements, but they contain some special inkscape data. The synoptic makes use of the layer name ("inkscape:label") to name the layer selectors. Note: this name may currently not contain any spaces.

- There may be two special layers, "background" and "symbols". The "background" layer is not user selectable but is always visible. Otherwise it works like any layer. The "symbols" layer is never visible; it is intended for keeping things that are useful while drawing the synoptic, such as the originals for various symbols. The "clone" functionality in inkscape is very convenient.

- Each of the layers may have any number of sublayers. These must be named "zoom#" where "#" is a digit. "zoom0" is the lowest zoom, "zoom1" more zoomed in, and so on. Only one of the zoom levels (per layer) will be visible at any time, depending on the user's zoom level.

- Items not belonging to a "zoom#" layer will always be visible if the layer is visible, regardless of zoom level. Likewise, things drawn directly in the "main" layer will be visible regardless of what layers are activated.

Example:

* main
 * layer1
  * zoom0
 * layer2
  * zoom0
  * zoom1


=== Tango connections ===

To connect an element to Tango, use the <desc> tag, accessible as "description" in the "Object Properties" dialog in Inkscape. It should be possible to connect any element or group of elements, including clones (<use> tags).

- To connect to a device, the syntax is "device=a/b/c". Right clicking the device should bring up a new window with an appropriate panel. (Needs specific programming for now).

- To connect to an attribute, the syntax is "attribute=a/b/c/attr". If the element is a text element, this will set the text to be the current value of the attribute (using the Tango format config, and unit if any). If the attribute is "Status", the fill color of the element will be set according to the tango status color scheme. (Not complete)

- It is also possible to specify a "section"; "section=nAme". It does not correspond directly to a tango entity but can be used to quickly zoom in on a specific part of the synoptic. Clicking on a section will zoom the view so that the element takes up the whole view.

Todo: Alarms


=== Gotchas ===

(These will hopefully be eliminated sooner or later)

- It is necessary that the size (width and height) of the SVG file are bigger than the resolution in pixels of the screen (e.g. > 2000 or so). Otherwise the image will be clipped and offsets may be wrong. Note however, that if there will be text in the SVG at significant zoom levels, the SVG size should be kept high anyway since small font sizes can result in bad rendering even if the letters appear big on the screen. Font sizes below 10 or so is not recommended.

- SVG transforms on the inkscape layers (main, layer, zoom) can also result in strange effects. It's easy to end up with these inadvertently in inkscape if you try to move things around by selecting the whole image at once. The best way I have found to get rid of such transforms is to manually edit the svg in a text editor, remove any transforms from the <g inkscape:groupmode="layer"> tags. Then you will have to open the file in inkscape again and move things back to their correct places, but make sure you don't select *everything* at the same time. It seems to work better if you only show one layer at a time, then it's OK to select everything and move it in one go.

- In SVG, inline styles take precedence over CSS styles. Therefore, if you want for example the "fill" style of an element to be affected by the class (e.g. if
