# SaveSession Widget
A configurable widget allowing users to save the current map settings into a session and restore them again later. A saved session includes the extent, visible layers and annotations of the current map. Sessions may be saved and loaded from files so they can be shared with others. additionally, users have the option to automatically restore their last session when returning to or reopening the viewe

|SaveSession Widget |
|:----------------------|
|![Save Session](./images/ScreenShot_01.PNG "Save Session Widget.")|


## Widget Configuration

Add the widget configuration object to the widgets object in your viewer config file, e.g., viewer.js.

```javascript
mapSessions: {
    include: true,
    id: 'mapSessions',
    type: 'titlePane',
    title: 'Map Sessions',
    open: false,
    canFloat: true,
    position: 180,
    path: 'jimu/BaseWidgetPanel',
    options: {
        widgetManager: true,
        config: {
            widgets: [{
                id: 'WABSaveSession',
                uri: 'widgets/SaveSession/Widget',
                config: {
                    fileNameForAllSessions: "GeoBase_Map_Session.json",
                    fileNameTplForSession: "GeoBase_Map_${name}.json"
                }
            }]
        }
    }
}
```

## Options (config)

* __fileNameForAllSessions__ - The file name used exporting all sessions.

* __fileNameTplForSession__ - The file name used when saving an individual session.


### Change Log

2018 September, 07 - Whitcomb

* Extended SaveSession WAB widget for the AFMC viewer to add support for automatic session restore when returning to or reopening the viewer.
* Fix issues with the session object errors.
* Standardize the widget to match the AFMC styles.
