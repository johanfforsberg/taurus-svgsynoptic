This is a Taurus synoptic widget based on the SVG format. It does roighly the same job as the JDraw based synoptic widget in Taurus, but in a more flexible way with, hopefully, better user interaction.

Note: this is an early version and things are very likely to change. Don't use if for something serious unless you are prepared for this...


Example
-------

There is a demonstration program in the "example" directory that can be started like so:

  python synoptic.py $(pwd)/example.svg

The example assumes a Tango installation and a running default TangoTest device in order to actually show anything of interest. Also, the path to the svg file must be absolute, for now, or you will get an error.

"synoptic.py" demonstrates how the widget might be used in an application, connecting mouse clicks to different functionality, etc. "example.svg" can serve as basis for building an SVG file. See below for various caveats.


Requirements
------------

- Taurus (and its dependencies Qt, PyQt, PyTango, etc)
- Qt version > 4.7 (not sure exactly which version, but older versions have some incompatibility regarding QWebView)
- qtwebkit (at least under CentOS, the "qtwebkit" package is apparently not automatically installed by PyQt)
- Panic/PyAlarm (this should be removed as a hard requirement)


TODO
----

This is still an early version. Some things that need attention:

- More flexible ways of displaying information. The tooltips for example are extremely simple (they only display the static information, e.g. device/attribute name).

- Alarm handling. Currently very rudimentary. Possibly, the actual handling should be kept out of the widget itself, to allow connection to different alarm systems.

- Performance. The widget has been in use for a while now and we currently have 140 devices and 20 attributes in a single synoptic. So far there haven't been any particular performance issues apart from somewhat slow startup. The widget tries to keep track of the currently visible elements and prevent polling on things not in view, but there may be better ways to handle this.

- Drawing. There are currently various pitfalls in the procedure of making a synoptic (see below) This needs to be streamlined.

- Taurusification. Currently it's technically a Taurus widget, but it's not configurable through a config.py file for example.


### Loose ideas/long-term plans:

- Make a web backend. This should be straightforward since the synoptic is already implemented as a webpage.

- More ways of navigation, e.g. search, bookmarks, etc.


The SVG file
------------

There are some requirements on the SVG file in order for the program to work correctly. They are subject to change. (Note that below, the term "layer" is used in the inkscape sense, as well as in the synoptic sense of selectable information layers. Maybe find a different word for the synoptic case?)

I have been using Inkscape as an SVG editor and it's almost a requirement right now since some inkscape specific attributes are used. This should of course be fixed.

- The SVG file must contain exactly one "top" level inkscape layer, which contains all further layers as sublayers.

- The sublayers of the main layer can be any number and will be used to create the selectable layers in the synoptic. Everything inside a layer will be visible if the layer is active, otherwise not.

- These layers are actually just SVG <g> ("group") elements, but they contain some special inkscape attributes. The synoptic makes use of the layer name ("inkscape:label") to name the layer selectors. Note: layer names may currently not contain any spaces and should consist of letters and numbers only.

- There may be two special layers, "background" and "symbols". The "background" layer is not user selectable but is always visible. Otherwise it works like any layer. The "symbols" layer is never visible; it is intended for keeping things that are useful while drawing the synoptic, such as the originals for various symbols. Tip: the "clone" (Alt+d) functionality in inkscape is very convenient.

- Each of the layers may have any number of sublayers. These must be named "zoom#" where "#" is a digit. "zoom0" is the lowest zoom (when the whole image is visible), "zoom1" more zoomed in, and so on, up to any number. Only one zoom level per layer will be visible at any time.

- Things in a selectable layer but not belonging to a "zoom#" will always be visible if the layer is activated, regardless of zoom level. Likewise, things drawn directly in the "main" layer will be visible regardless of what layers are activated.

- Currently, items (devices, attributes, etc) not belonging to a zoom level in a selectable layer may not be correctly displayed or updated.

Example layer structure:

* main
  * layer1
    * zoom0
  * layer2
    * zoom0
    * zoom1
  * background
    * zoom0
  * symbols

Note that in n SVG file, things are drawn in the order they appear in the file, so that later objects come on top of earlier ones. The layer structure in inkscape is shown "upside down" from the real structure (which makes more sense in a drawing program) so that layers higher up are drawn on top of lower layers. Just something to keep in mind; for example it't probably a good idea to put the "background" layer (if any) at the bottom so that it's always drawn behind everything else.


### Tango connections

To connect an element to Tango, use the <desc> tag, accessible as "description" in the "Object Properties" dialog in Inkscape. It should be possible to connect any element or group of elements, including clones (<use> tags).

- To connect to a device, put "device=a/b/c" in the description. This will automatically connect the element to the "Status" attribute of the device, which means that the color of the element gets set to the appropriate Tango status color. (Note: here the style plays an important role; if it is a simple element (e.g. a circle) that you are using, overriding the fill color with CSS should just work, but if it's a group, the fill will be set on the *group* element. This means that hardcoded colors in the SVG won't be overridden, but if you make sure there's no "fill" style on the element itself (it should show up as black in inkscape) it should inherit the fill color from the parent group and all will be fine. This can be exploited, e.g. if you only want part of your symbol to be colored for status, for example a "diode"). Clicks on devices will cause the widget to emit "clicked" or "rightClicked" signals.

- To connect directly to an attribute, the syntax is "attribute=a/b/c/attr". If the element is a text element, this will set the text to be the current value of the attribute (using the Tango format and unit). If the attribute is "Status", the fill color of the element will be set according to the Taurus status color scheme. (See above). There will be need for more specific support for various types here.

- It is also possible to specify a "section"; "section=name". It does not correspond directly to a tango entity but can be used to quickly zoom in on a specific part of the synoptic. Clicking on a section will zoom the view so that the element takes up the whole view.

- to specify that an alarm should be connected to the item, use the "alarm=tag" syntax. Whenever that alarm is active, the item will have the "alarm" and "active" classes (default: pulsating red glow). There is currently some hacky logic to automatically support sub-alarms (e.g. alarms on individual devices) but it is sort of impractical ATM. Manually adding all alarms is tedious and easy to mess up though, so we need to figure out a good solution here.

These connections can be used in combination, by putting more than one on its own row in the description. A section that should be connected to an alarm: "section=sec1" and "alarm=sec1_alarm", etc.


### Gotchas

(These will hopefully be eliminated sooner or later)

- It is necessary that the size (width and height) of the SVG file are bigger than the resolution in pixels of the screen (e.g. > 2000 or so). Otherwise the image will be clipped and offsets may be wrong. Note however, that if there will be text in the SVG at significant zoom levels, the SVG size should be kept high anyway since small font sizes can result in bad rendering even if the letters appear big on the screen. Font sizes below 10 or so is not recommended.

- SVG transforms on the inkscape layers (main, layer, zoom) can also result in strange effects. It's easy to end up with these inadvertently in inkscape if you try to move things around by selecting the whole image at once. The best way I have found to get rid of such transforms is to manually edit the svg in a text editor, remove any transforms from the <g inkscape:groupmode="layer"> tags. Then you will have to open the file in inkscape again and move things back to their correct places, but make sure you don't select *everything* at the same time. It seems to work better if you only show one layer at a time, then it's OK to select everything and move it in one go.

- In SVG, inline styles seem to generally take precedence over CSS styles. Therefore, if you want for example the "fill" style of an element to be affected by the class (e.g. if using the State attribute), it may be necessary to manually remove any "fill" style set by inkscape. This can be done using Inkscape's built in XML editor (menu "Edit">"XML Editor..."). Look for the "style" tag and remove any "fill:whatever" (if fill color is what you want to change). The element will bre drawn completely black if there is no specified fill.
