///////////////////////////////////////////////////////////////////////////
// Copyright © 2015 Softwhere Solutions
// All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////
/*global console, define, dojo, FileReader */

define(['dojo/_base/declare',
        'jimu/BaseWidget',
        'dijit/_WidgetsInTemplateMixin',
        'dojo/_base/lang',
        'dojo/_base/array',
        'dojo/_base/html',
        'dojo/_base/unload',
        'dojo/dom-attr',
        'dojo/query',
        'dojo/io-query',
        'dojo/on',
        'dojo/topic',
        'dojo/string',
        'dojo/json',
        'dojo/Deferred',
        'dojo/promise/all',
        'esri/geometry/Extent',
        'esri/graphic',
        'esri/layers/GraphicsLayer',
        'esri/layers/FeatureLayer',
        'esri/layers/ImageParameters',
        'esri/layers/ArcGISDynamicMapServiceLayer',
        'esri/layers/ArcGISTiledMapServiceLayer',
        'jimu/ConfigManager',
        'jimu/MapManager',
        'jimu/dijit/Popup',
        'jimu/dijit/Message',
        'jimu/LayerInfos/LayerInfos',
        'jimu/dijit/SimpleTable',
        'dijit/form/Form',
        'dijit/form/TextBox',
        'dijit/form/RadioButton',
        'dijit/TooltipDialog',
        'dijit/popup',
        'xstyle/css!./css/sprite.css'
    ],
    function(declare,
        BaseWidget,
        _WidgetsInTemplateMixin,
        lang,
        array,
        html,
        baseUnload,
        domAttr,
        query,
        ioQuery,
        on,
        topic,
        string,
        JSON,
        Deferred,
        all,
        Extent,
        Graphic,
        GraphicsLayer,
        FeatureLayer,
        ImageParameters,
        ArcGISDynamicMapServiceLayer,
        ArcGISTiledMapServiceLayer,
        ConfigManager,
        MapManager,
        Popup,
        Message,
        LayerInfos,
        Table,
        Form,
        TextBox,
        RadioButton,
        TooltipDialog,
        popup) {
        //To create a widget, you need to derive from BaseWidget.
        return declare([BaseWidget, _WidgetsInTemplateMixin], {
            // Custom widget code goes here

            baseClass: 'jimu-widget-savesession',

            // name of sessions string in local storage
            storageKey: "sessions",

            // the saved sessions
            sessions: [],

            // JW - add option to limit exessive use of console.log
            debugMode: false,
            helpRestoreSessionText: 'Restored sessions will use the extent, visible layers, graphics, etc. from your last visit when loading the site.',
            helpNewSessionText: 'New sessions will use the site defaults when loading the site.',

            siteSettingsObj: null,
            globalSettingsObj: null,
            restoreSite: null,
            sessionStorageItemName: 'GeoBaseViewer_sessionSettings',
            siteStorageItemName: 'GeoBaseViewer_siteSettings',
            restoreMapSessionAtStartup: false,
            urlParams: ioQuery.queryToObject(document.location.search.substr((document.location.search[0] === "?" ? 1 : 0))),
            configName: '',
            currentSession: null,
            mapChangedHandlers: [],

            postCreate: function() {
                this.inherited(arguments);

                // setup save to file
                this.saveToFileForm.action = this.config.saveToFileUrl;
                this.saveToFileName.value = this.config.defaultFileName;

                if (typeof this.config.useServerToDownloadFile == 'undefined') this.config.useServerToDownloadFile = false;

                this.loadSavedSessionsFromStorage();

                this.initSavedSessionUI();

                this.initNewSessionUI();

                this.refreshLoadFileUI();

                this.addHelpTips();

                this.configName = this.urlParams.config ? this._validNameForId(this.urlParams.config) : 'viewer';
                // get user settings...
                if (typeof(Storage) != 'undefined') {

                    var savedGlobalSettings = window.localStorage.getItem(this.siteStorageItemName);
                    if (savedGlobalSettings) {
                        this.globalSettingsObj = JSON.parse(savedGlobalSettings);
                        if (this.globalSettingsObj) {
                            if (this.globalSettingsObj.restoreSite)
                                this.restoreSite = this.globalSettingsObj.restoreSite;
                        }
                    } else {
                        this.globalSettingsObj = {
                            restoreSite: null
                        };
                    }

                    var savedSiteSettingsKey = this.sessionStorageItemName + '_' + this.configName;
                    var savedSiteSettings = window.localStorage.getItem(savedSiteSettingsKey);
                    if (savedSiteSettings) {
                        this.siteSettingsObj = JSON.parse(savedSiteSettings);
                        if (this.siteSettingsObj.restoreMapSessionAtStartup) {
                            this.restoreMapSessionAtStartup = this.siteSettingsObj.restoreMapSessionAtStartup;
                            this.activeMapSession = this.siteSettingsObj.activeMapSession;
                            this.saveMapSessionForm.set("value", {
                                'startup-sessions': 'restored'
                            });
                            // specify site...
                            this.globalSettingsObj.restoreSite = this.configName;
                            this.enableRestoredSessions();
                            // load the session...
                            this.loadSession(this.activeMapSession);
                        } else {
                            this.siteSettingsObj.restoreMapSessionAtStartup = this.restoreMapSessionAtStartup;
                        }
                    } else {
                        this.siteSettingsObj = {
                            restoreMapSessionAtStartup: this.restoreMapSessionAtStartup,
                            activeMapSession: null
                        };
                    }
                }

                if (this.debugMode) console.log('SaveSession :: postCreate :: completed');
            },

            startup: function() {
                this.inherited(arguments);
                if (this.debugMode) console.log('SaveSession :: startup');
            },

            onOpen: function() {
                if (this.debugMode) console.log('SaveSession :: onOpen');
            },

            /**
             * create the table of saved sessions
             */
            initSavedSessionUI: function() {
                var tableSettings = {
                    autoHeight: true,
                    fields: [{
                            "name": "name",
                            "title": "Session",
                            "type": "text",
                            "class": "session-name",
                            "unique": true,
                            "hidden": false,
                            "editable": false
                        },
                        {
                            "name": "actions",
                            "title": "Actions",
                            "type": "actions",
                            "class": "actions",
                            "actions": ['delete', 'down', 'up', 'download', 'load']
                            // JW - disable unsupported 'edit' action
                            // "actions": ['load', 'download', 'edit', 'up', 'down', 'delete']
                        }
                    ],
                    selectable: false
                };

                this.sessionTable = new Table(tableSettings);
                this.sessionTable.placeAt(this.savedSessionContainer);
                this.sessionTable.startup();

                // listend for events on session table
                this.own(on(this.sessionTable, 'row-delete', lang.hitch(this, 'onSessionTableChanged')));
                this.own(on(this.sessionTable, 'row-up', lang.hitch(this, 'onSessionTableChanged')));
                this.own(on(this.sessionTable, 'row-down', lang.hitch(this, 'onSessionTableChanged')));
                // JW - disable unsupported action, editing would change the session ID (the session name)
                // this.own(on(this.sessionTable, 'row-edit', lang.hitch(this, 'onSessionTableChanged')));

                this.own(on(this.sessionTable, 'row-click', lang.hitch(this, 'onLoadSessionClicked')));
                this.own(on(this.sessionTable, 'actions-load', lang.hitch(this, 'onLoadSessionClicked')));
                // JW - disable action that should be used for editing if code is updated to support that
                // this.own(on(this.sessionTable, 'row-dblclick', lang.hitch(this, 'onLoadSessionClicked')));

                this.own(on(this.sessionTable, 'actions-download', lang.hitch(this, 'onSaveItemToFileClicked')));

                this.sessionTable.addRows(this.sessions);
                if (this.debugMode) console.log('SaveSession :: initSavedSessionUI :: session table created');
            },

            /**
             * reload the table with the saved sessions
             */
            refreshSavedSessionUI: function() {
                this.sessionTable.clear();
                this.sessionTable.addRows(this.sessions);
                if (this.debugMode) console.log('SaveSession :: refreshSavedSessionUI :: session table refreshed');
            },

            /**
             * set up the UI for New Session
             */
            initNewSessionUI: function() {
                this.refreshNewSessionUI();
                this.own(this.sessionNameTextBox.on('change', lang.hitch(this, 'refreshNewSessionUI')));
                this.own(this.sessionNameTextBox.on('keypress', lang.hitch(this, 'onKeyPressed')));
                if (this.debugMode) console.log('SaveSession :: initNewSessionUI :: end');
            },

            /**
             * enable the save file link when there are sessions
             */
            refreshLoadFileUI: function() {

                var sessionString = "",
                    hasSessions = false;

                hasSessions = this.sessions && this.sessions.length > 0;
                if (!hasSessions) {
                    domAttr.set(this.saveToFileButton, "disabled", "true");
                    html.addClass(this.saveToFileButton, "jimu-state-disabled");
                    if (this.debugMode) console.log('SaveSession :: refreshLoadFileUI :: save to file button disabled');
                } else {
                    domAttr.remove(this.saveToFileButton, "disabled");
                    html.removeClass(this.saveToFileButton, "jimu-state-disabled");
                    if (this.debugMode) console.log('SaveSession :: refreshLoadFileUI :: save to file button enabled');
                }

                // use a data url to save the file, if not using a server url
                // if useServerToDownloadFile, use a form post to a service instead
                if (!this.config.useServerToDownloadFile) {
                    // also set the save to link if has sessions
                    // this uses data url to prompt user to download
                    if (hasSessions) {
                        sessionString = JSON.stringify(this.sessions);
                        // must convert special chars to url encoding
                        sessionString = encodeURIComponent(sessionString);
                        domAttr.set(this.saveToFileButton, "href", "data:application/octet-stream," + sessionString);
                        domAttr.set(this.saveToFileButton, "download", this.config.fileNameForAllSessions);
                        if (this.debugMode) console.log('SaveSession :: refreshLoadFileUI :: data url set on saveToFileButton');
                    }
                }
            },

            /**
             * when a key is pressed, check the session name
             * @param {Object} e event args
             */
            onKeyPressed: function(e) {

                if (e.keyCode === dojo.keys.ENTER) {
                    this.onSaveButtonClicked();
                }

                setTimeout(lang.hitch(this, 'refreshNewSessionUI'), 0);
                if (this.debugMode) console.log('SaveSession :: onKeyPressed :: end');
            },

            /**
             * enable the save button when a valid entry is in textbox
             */
            refreshNewSessionUI: function() {
                var sessionName = "",
                    isValid = false;
                sessionName = this.sessionNameTextBox.get("value");

                // must have a valid session name to enable save
                isValid = this.isValidSessionName(sessionName);

                if (!isValid) {
                    domAttr.set(this.saveButton, "disabled", "true");
                    html.addClass(this.saveButton, "jimu-state-disabled");
                    if (this.debugMode) console.log('SaveSession :: refreshNewSessionUI :: save button disabled');
                } else {
                    domAttr.remove(this.saveButton, "disabled");
                    html.removeClass(this.saveButton, "jimu-state-disabled");
                    if (this.debugMode) console.log('SaveSession :: refreshNewSessionUI :: save button enabled');
                }

                this.inputText.innerHTML = this.getMesageForSessionName(sessionName);
                if (this.debugMode) console.log('SaveSession :: refreshNewSessionUI :: end');
            },

            /**
             * checks if the given name is valid - has text and is not already taken
             * @param   {String} sessionName name for the session
             * @returns {Boolean}  true if the given session name is not already entered
             */
            isValidSessionName: function(name) {

                if (!name) {
                    return false;
                }

                // check for duplicates
                var hasSameName = array.some(this.sessions, function(session) {
                    return session.name === name;
                }, this);

                return !hasSameName;
            },

            /**
             * checks if the given name is valid - has text and is not already taken
             * @param   {String} sessionName name for the session
             * @returns {String}  true if the given session name is not already entered
             */
            getUniqueSessionName: function(name, idx) {

                idx = idx || 0; // default to 0

                idx += 1;

                var newName = name + " " + String(idx);

                if (!this.isValidSessionName(newName)) {

                    newName = this.getUniqueSessionName(name, idx);
                }

                return newName;
            },

            /**
             * returns input text for session name
             * @param   {String} sessionName name for the session
             * @returns {String}  a help message
             */
            getMesageForSessionName: function(name) {

                var text = "",
                    hasSameName = false;

                if (!name) {
                    text = ""; //"Enter the name for the session";
                }

                // check for duplicates
                hasSameName = array.some(this.sessions, function(session) {
                    return session.name === name;
                }, this);

                if (hasSameName) {
                    text = "Error: Name must be unique.";
                }

                return text;
            },

            /**
             * when the save button is clicked, add the session to local storage
             */
            onSaveButtonClicked: function() {
                if (this.debugMode) console.log('SaveSession :: onSaveButtonClicked :: begin');
                var session,
                    sessionName = "";
                sessionName = this.sessionNameTextBox.get("value");

                if (!this.isValidSessionName(sessionName)) {
                    if (this.debugMode) console.log('SaveSession :: onSaveButtonClicked :: invalid sesion name = ', sessionName);
                    return;
                }

                session = this.getSettingsForCurrentMap();
                session.name = sessionName;
                this.sessions.push(session);
                if (this.debugMode) console.log("SaveSession :: onSaveButtonClicked :: added session = ", session);

                this.storeSessions();

                this.sessionTable.addRow(session);
                this.sessionNameTextBox.set("value", "");
                this.refreshLoadFileUI();
                this.refreshNewSessionUI();
                this._showInfo("Session Added!", "success");
                if (this.debugMode) console.log('SaveSession :: onSaveButtonClicked :: end');
            },

            /**
             * get the sessions from the table and store them
             */
            onSessionTableChanged: function(e) {
                if (this.debugMode) console.log('SaveSession :: onSessionTableChanged :: begin');

                // store changed sessions
                // JW - getItems() does not exist in SimpleTable class...
                // this.sessions = this.sessionTable.getItems();

                // JW - BEGIN: reworked to deal with implementation discrepencies with SimpleTable
                var updatedSessionsArray = [];
                var sessionRows = this.sessionTable.getRows();

                array.forEach(sessionRows, lang.hitch(this, function(sessionRow) {
                    for (var i = 0, len = this.sessions.length; i < len; i++) {
                        var pastSession = this.sessions[i];
                        if (this.debugMode) console.log(sessionRow.textContent + " vs. " + pastSession.name)
                        if (sessionRow.textContent === pastSession.name) {
                            // keep it
                            updatedSessionsArray.push(pastSession);
                        }
                    }
                }));
                // update the sessions array
                this.sessions = updatedSessionsArray;
                // JW - END: reworked to deal with implementation discrepencies with SimpleTable
                this.storeSessions();

                // and update ui
                this.refreshLoadFileUI();
                this.refreshNewSessionUI();

                if (this.debugMode) console.log('SaveSession :: onSessionTableChanged :: session stored');
            },

            /**
             * Load the session when clicked in Table
             * @param {Object} e the event args - item = session
             */
            onLoadSessionClicked: function(e) {
                // JW - updated to deal with implementation discrepencies with SimpleTable
                // var session = e.item;
                var session = this.getSessionByName(e.textContent);
                if (this.debugMode) console.log('SaveSession :: onLoadSessionClicked :: session  = ', session);
                this.loadSession(session);
            },

            /**
             * prompt to upload file
             * @param {Object} e the event args
             */
            onLoadFromFileButtonClicked: function(e) {

                var popup = new Popup({
                    titleLabel: "Load sessions from file",
                    autoHeight: true,
                    content: "Choose the file to load: <input type='file' id='file-to-load' name='file' enctype='multipart/form-data' />",
                    container: jimuConfig.layoutId,
                    width: 400,
                    height: 200,
                    buttons: [{
                        label: "Ok",
                        key: dojo.keys.ENTER,
                        onClick: lang.hitch(this, function() {
                            if (this.debugMode) console.log('SaveSession :: onLoadFromFile :: ok');
                            var fileInput,
                                fileName;

                            // get file from input
                            fileInput = query('#file-to-load', popup.domNode)[0];
                            fileName = fileInput.files[0];
                            popup.close();
                            this.loadSavedSessionsFromFile(fileName);
                        })

                    }, {
                        label: "Cancel",
                        key: dojo.keys.ESCAPE,
                        onClick: lang.hitch(this, function() {
                            if (this.debugMode) console.log('SaveSession :: onLoadFromFile :: canceled');
                            popup.close();
                        })
                    }],
                    onClose: lang.hitch(this, function() {
                        if (this.debugMode) console.log('SaveSession :: onLoadFromFile :: closed');
                    })
                });
                if (this.debugMode) console.log('SaveSession :: onLoadFromFileButtonClicked :: ');
            },

            /**
             * save all sessions to file
             * @param {Object} e the event args
             */
            onSaveToFileButtonClicked: function(e) {
                // JW - BEGIN: reworked to deal with implementation discrepencies with SimpleTable
                var sessionString = JSON.stringify(this.sessions),
                    fileName = this.config.fileNameForAllSessions;

                // update form values
                this.saveToFileName.value = fileName;
                this.saveToFileContent.value = sessionString;

                if (this.config.useServerToDownloadFile) {
                    // trigger the post to server side
                    this.saveToFileForm.submit();
                } else {
                    // this uses data url to prompt user to download
                    // must convert special chars to url encoding
                    sessionString = encodeURIComponent(sessionString);
                    domAttr.set(this.saveTplFileButton, "href", "data:application/octet-stream," + sessionString);
                    domAttr.set(this.saveTplFileButton, "download", fileName);
                    this.saveTplFileButton.click();
                    if (this.debugMode) console.log('SaveSession :: onSaveItemToFileClicked :: data url used for download');
                }

                if (this.debugMode) console.log('SaveSession :: onSaveToFileButtonClicked :: end');
            },

            /**
             * save the single item to file
             * @param {Object} e the event args
             */
            onSaveItemToFileClicked: function(e) {

                // JW - BEGIN: reworked to deal with implementation discrepencies with SimpleTable
                var sessionString = "",
                    fileName = this.config.fileNameTplForSession.replace("${name}", e.textContent),
                    uSession = this.getSessionByName(e.textContent);

                if (uSession) {
                    sessionString = JSON.stringify([uSession]);

                    // update form values
                    this.saveToFileName.value = fileName;
                    this.saveToFileContent.value = sessionString;

                    if (this.config.useServerToDownloadFile) {
                        // trigger the post to server side
                        this.saveToFileForm.submit();
                    } else {
                        // this uses data url to prompt user to download
                        // must convert special chars to url encoding
                        sessionString = encodeURIComponent(sessionString);
                        domAttr.set(this.saveTplFileButton, "href", "data:application/octet-stream," + sessionString);
                        domAttr.set(this.saveTplFileButton, "download", fileName);
                        this.saveTplFileButton.click();
                        if (this.debugMode) console.log('SaveSession :: onSaveItemToFileClicked :: data url used for download');
                    }
                    if (this.debugMode) console.log('SaveSession :: onSaveItemToFileClicked :: saveToFileForm submited.');
                } else {
                    if (this.debugMode) console.log('SaveSession :: onSaveItemToFileClicked :: saveToFileForm no session found.');
                }
                // JW - END: reworked to deal with implementation discrepencies with SimpleTable

                if (this.debugMode) console.log('SaveSession :: onSaveItemToFileClicked :: end');
            },

            /**
             * JW - get target session by name
             * @param {String} name of saved session
             */
            getSessionByName: function(name) {
                var foundSession = null;
                array.forEach(this.sessions, function(session) {
                    if (session.name === name) {
                        foundSession = session;
                        return foundSession;
                    }
                });
                return foundSession;
            },

            /**
             * load the session definitions from the given text file
             * @param {Object} file reference to text file to load
             */
            loadSavedSessionsFromFile: function(file) {
                if (this.debugMode) console.log('SaveSession :: loadSavedSessionsFromFile :: begin for file = ', file);

                var sessionsString = "",
                    sessionsToLoad = null,
                    reader,
                    msg,
                    loadedCount = 0,
                    me = this;

                reader = new FileReader();

                // when the file is loaded
                reader.onload = function() {
                    var sessionsString = reader.result;

                    if (!sessionsString) {
                        console.warn("SaveSession :: loadSavedSessionsFromFile : no sessions to load");
                        msg = new Message({
                            message: "No sessions found in the file.",
                            type: 'message'
                        });
                        return;
                    }

                    sessionsToLoad = JSON.parse(sessionsString);
                    if (this.debugMode) console.log("SaveSession :: loadSavedSessionsFromFile : sessions found ", sessionsToLoad);

                    array.forEach(sessionsToLoad, function(sessionToLoad) {
                        var isValid = me.isValidSessionName(sessionToLoad.name);
                        if (!isValid) {
                            // fix the session name
                            sessionToLoad.name = me.getUniqueSessionName(sessionToLoad.name);
                            if (this.debugMode) console.log("SaveSession :: loadSavedSessionsFromFile :: session name changed to " + sessionToLoad.name);
                        }

                        // refresh tabl
                        this.sessions.push(sessionToLoad);
                        this.sessionTable.addRow(sessionToLoad);
                        loadedCount += 1;
                    }, me);

                    // do not call refresh ui since session table will trigger change event
                    me.storeSessions();
                    me.refreshLoadFileUI();

                    msg = new Message({
                        message: String(loadedCount) + " sessions loaded from the file.",
                        type: 'message'
                    });

                    if (this.debugMode) console.log('SaveSession :: loadSavedSessionsFromFile :: end for file = ', file);
                };

                // starting reading, and continue when load event fired
                reader.readAsText(file);
            },

            /**
             * Apply the settings from the given session to the current map
             * @param {Object} sessionToLoad a session
             */
            loadSession: function(sessionToLoad) {

                var onMapChanged,
                    extentToLoad;

                if (sessionToLoad.webmapId && sessionToLoad.webmapId !== this.map.itemId) {
                    if (this.debugMode) console.log('SaveSession :: loadSession :: changing webmap = ', sessionToLoad.webmapId);


                    onMapChanged = topic.subscribe("mapChanged", lang.hitch(this, function(newMap) {

                        if (this.debugMode) console.log('SaveSession :: loadSession :: map changed from  ', this.map.itemId, ' to ', newMap.itemId);

                        // update map reference here
                        // since this.map still refers to old map?
                        // ConfigManager has not recreated widget with new map yet
                        this.map = newMap;

                        // do not listen any more
                        onMapChanged.remove();

                        // load the rest of the session
                        this.loadSession(sessionToLoad);
                    }));


                    ConfigManager.getInstance()._onMapChanged({
                        "itemId": sessionToLoad.webmapId
                    });

                    // do not continue until webmap is changed
                    return;
                }

                //  zoom the map
                if (sessionToLoad.extent) {
                    extentToLoad = new Extent(sessionToLoad.extent);
                    this.map.setExtent(extentToLoad).then(function() {
                        if (this.debugMode) console.log('SaveSession :: loadSession :: new extent  = ', extentToLoad);
                    }, lang.hitch(this, function() {
                        // if at first you don't succeed, try again in 3 seconds...
                        lang.hitch(this, setTimeout(lang.hitch(this, function() { // let it breathe a bit while the site loads...
                            this.map.setExtent(extentToLoad).then(lang.hitch(this, function() {
                                if (this.debugMode) console.log('SaveSession :: loadSession :: extentToLoad:', extentToLoad);
                            }, function() {
                                var msg = new Message({
                                    message: "An error occurred zooming to session extent.",
                                    type: 'error'
                                });
                            }));
                        }), 3000));
                    }));
                }

                // load the saved graphics
                this.setGraphicsOnCurrentMap(sessionToLoad.graphics);


                // toggle layers
                if (sessionToLoad.layers) {
                    this.setLayersOnMap(sessionToLoad.layers);
                }

                if (this.debugMode) console.log('SaveSession :: loadSession :: session  = ', sessionToLoad);
            },

            /**
             * apply settings to layers
             * @param {Array} array of layer settings to apply to map
             */
            setLayersOnMap: function(settings) {
                var propName = "",
                    layerSettings,
                    layer,
                    addGraphicsToLayer;

                array.forEach(settings, function(layerSettings) {
                    layer = this.map.getLayer(layerSettings.id);
                    if (!layer) {
                        if (this.debugMode) console.log('SaveSession :: setLayersOnMap :: no layer found with id = ', propName);
                        layer = this.addLayerToMap(layerSettings);
                        // exit here? or re-apply settings
                        return;
                    }

                    // set visible
                    if (layer.setVisibility) {
                        layer.setVisibility(layerSettings.isVisible);
                        if (this.debugMode) console.log('SaveSession :: loadSession :: set visibility = ', layerSettings.isVisible, ' for layer : id=', layer.id);
                    }

                    if (layerSettings.visibleLayers && layer.setVisibleLayers) {
                        layer.setVisibleLayers(layerSettings.visibleLayers);
                    }

                    if (this.debugMode) console.log('SaveSession :: loadSession :: setLayersOnMap completed for layer = ', layer.id);
                }, this);

                // fire refresh event
                LayerInfos.getInstance(this.map, this.map.itemInfo).then(function(layerInfosObject) { // fire change event to trigger update
                    on.emit(layerInfosObject, "updated");
                    //layerInfosObject.onlayerInfosChanged();
                });

            },

            /**
             * create a new map layer with the given settings
             * @param {Object} layerSettings settings for the layer
             * @return {Object} layer oject
             */
            addLayerToMap: function(layerSettings) {
                if (this.debugMode) console.log('SaveSession :: addLayerToMap :: adding layer = ', layerSettings);
                var layer,
                    options;
                switch (layerSettings.type) {
                    case "ArcGISDynamicMapServiceLayer":
                        options = lang.clone(layerSettings.options);
                        options.imageParameters = new ImageParameters();
                        lang.mixin(options.imageParameters, layerSettings.options.imageParameters);
                        layer = new ArcGISDynamicMapServiceLayer(layerSettings.url, options);
                        if (this.debugMode) console.log('SaveSession :: addLayerToMap :: created ArcGISDynamicMapServiceLayer layer = ', layer);
                        break;
                    case "FeatureLayer":
                        layer = new FeatureLayer(layerSettings.url, layerSettings.options);
                        if (this.debugMode) console.log('SaveSession :: addLayerToMap :: created Feature layer = ', layer);
                        break;
                    case "ArcGISTiledMapServiceLayer":
                        layer = new ArcGISTiledMapServiceLayer(layerSettings.url, layerSettings.options);
                        if (this.debugMode) console.log('SaveSession :: addLayerToMap :: created ArcGISTiledMapServiceLayer layer = ', layer);
                        break;
                    default:
                        if (this.debugMode) console.log('SaveSession :: addLayerToMap :: unsupported layer type = ', layerSettings.type);
                        break;
                }

                if (layerSettings.name) {
                    layer.name = layerSettings.name;
                }

                // The bottom most layer has an index of 0.
                this.map.addLayer(layer, layerSettings.order);
                if (this.debugMode) console.log('SaveSession :: addLayerToMap :: created layer for ', layer.id, ' using settings = ', layerSettings);
                return layer;
            },

            /**
             * returns the session object for the current map
             * @returns {Object} map settings for session
             */
            getSettingsForCurrentMap: function() {

                var settings = {
                    name: "",
                    webmapId: "",
                    extent: null,
                    layers: [],
                    graphics: []
                };

                settings.extent = this.map.extent;
                settings.webmapId = this.map.itemId;

                settings.graphics = this.getGraphicsForCurrentMap();

                // have to use async to get layers
                this.getLayerSettingsForCurrentMap().then(function(layerSettings) {
                    settings.layers = layerSettings;
                    if (this.debugMode) console.log('SaveSession :: getSettingsForCurrentMap :: layerSettings completed  = ', layerSettings);
                }, function(err) {
                    var msg = new Message({
                        message: string.substitute("An error getting the layers from the current map."),
                        type: 'error'
                    });
                });

                return settings;
            },

            /**
             * async return the settings for the current layers on the map
             * @returns {Array} returns an array of layers defs to save
             */
            getLayerSettingsForCurrentMap: function() {
                var def = new Deferred();
                this.getLayerObjectsFromMap().then(lang.hitch(this, function(result) {
                    if (this.debugMode) console.log('SaveSession :: getLayerSettingsForCurrentMap :: layersObects  = ', result);
                    try {
                        var settings = [],
                            layerSettings,
                            maxIndex = result.layerObjects.length;
                        array.forEach(result.layerObjects, function(layer, idx) {
                            // layer settings uses layerId as property name
                            layerSettings = this.getSettingsForLayer(layer);
                            layerSettings.order = maxIndex - idx; // The bottom most layer has an index of 0. so reverse order
                            settings.push(layerSettings);
                        }, this);

                        def.resolve(settings);
                    } catch (err) {
                        console.error('SaveSession :: getLayerSettingsForCurrentMap :: error getting layersObects  = ', err);
                        def.reject(err);
                    }

                }), lang.hitch(this, function(err) {
                    console.error('SaveSession :: getLayerSettingsForCurrentMap :: error getting layersObects  = ', err);
                    def.reject(err);
                }));

                return def.promise;
            },

            /**
             * return the settings to store for the given layer
             * @param   {esri.layers.Layer}   layer the layer to get the settings for
             * @returns {Object} the settings object to store for the given layer
             */
            getSettingsForLayer: function(layer) {
                var layerSettings = {
                    id: layer.id,
                    name: layer.name,
                    type: "",
                    isVisible: layer.visible,
                    visibleLayers: layer.visibleLayers || null,
                    url: layer.url,
                    options: null
                };

                layerSettings.type = this.getLayerType(layer);

                switch (layerSettings.type) {
                    case "ArcGISDynamicMapServiceLayer":
                        layerSettings.options = this.getOptionsForDynamicLayer(layer);
                        break;
                    case "FeatureLayer":
                        layerSettings.options = this.getOptionsForFeatureLayer(layer);
                        if (this.debugMode) console.log('SaveSession :: getSettingsForLayer :: added options for feature layer = ', layerSettings);
                        break;
                    case "ArcGISTiledMapServiceLayer":
                        layerSettings.options = this.getOptionsForTiledLayer(layer);
                        if (this.debugMode) console.log('SaveSession :: getSettingsForLayer :: added options for tiled layer = ', layerSettings);
                        break;

                    default:
                        if (this.debugMode) console.log('SaveSession :: getSettingsForLayer :: no options for layer type = ', layerSettings.type);
                        break;
                }

                if (this.debugMode) console.log('SaveSession :: getSettingsForCurrentMap :: settings ', layerSettings, ' added for layer = ', layer.id);
                return layerSettings;
            },

            /**
             * return the options object to create the given layer
             * @param   {esri.layers.ArcGISDynamicMapServiceLayer}   layer the ArcGISDynamicMapServiceLayer
             * @returns {Object} Object with properties for the ArcGISDynamicMapServiceLayer constructor
             */
            getOptionsForDynamicLayer: function(layer) {
                var ip,
                    options = {
                        id: layer.id,
                        imageParameters: null,
                        opacity: layer.opacity,
                        refreshInterval: layer.refreshInterval,
                        visible: layer.visible
                    };

                if (layer.imageFormat) {
                    ip = {
                        format: layer.imageFormat,
                        dpi: layer.dpi
                    };

                    options.imageParameters = ip;
                }

                if (this.debugMode) console.log('SaveSession :: getOptionsForDynamicLayer :: options =  ', options, ' for layer = ', layer.id);
                return options;
            },

            /**
             * return the options object to create the given layer
             * @param   {esri.layers.FeatureLayer}   layer the FeatureLayer
             * @returns {Object} Object with properties for the FeatureLayer constructor
             */
            getOptionsForFeatureLayer: function(layer) {

                var options = {
                    id: layer.id,
                    mode: FeatureLayer.MODE_ONDEMAND,
                    outFields: ["*"],
                    opacity: layer.opacity,
                    refreshInterval: layer.refreshInterval,
                    visible: layer.visible
                };

                // TODO: get mode?

                if (this.debugMode) console.log('SaveSession :: getOptionsForFeatureLayer :: options =  ', options, ' for layer = ', layer.id);
                return options;
            },

            /**
             * return the options object to create the given layer
             * @param   {esri.layers.ArcGISTiledMapServiceLayer}   layer the Tiled layer
             * @returns {Object} Object with properties for the ArcGISTiledMapServiceLayer constructor
             */
            getOptionsForTiledLayer: function(layer) {

                var options = {
                    id: layer.id,
                    opacity: layer.opacity,
                    refreshInterval: layer.refreshInterval,
                    visible: layer.visible
                };

                if (this.debugMode) console.log('SaveSession :: getOptionsForTiledLayer :: options =  ', options, ' for layer = ', layer.id);
                return options;
            },

            /**
             * return all the settings for the current graphic layers
             * @returns {Array} array of settings objects for each graphic layer
             */
            getGraphicsForCurrentMap: function() {
                var settings = [],
                    graphicLayer,
                    layerSettings;

                // always add the default graphics layer
                layerSettings = this.getSettingsFromGraphicsLayer(this.map.graphics);
                settings.push(layerSettings);

                // save the graphics for other layers
                array.forEach(this.map.graphicsLayerIds, function(layerId) {
                    graphicLayer = this.map.getLayer(layerId);
                    if (graphicLayer.graphics.length > 0) {
                        // if there are graphics then save the settings
                        layerSettings = this.getSettingsFromGraphicsLayer(graphicLayer);
                        // JW - For CMV Only: Ignore graphics from operationalLayers...
                        if (this.widgetManager && this.widgetManager.cmvConfig && this.widgetManager.cmvConfig.operationalLayers) {
                          if (!isOperationalLayer(layerSettings.id, this.widgetManager.cmvConfig.operationalLayers)) {
                              settings.push(layerSettings);
                          }
                        }
                    }
                }, this);

                function isOperationalLayer(lyr, opLayers) {
                    var isOpLyr = false;
                    array.forEach(opLayers, function(opLyr) {
                        if (opLyr.options.id == lyr) {
                            isOpLyr = true;
                        }
                    }, lyr);
                    return isOpLyr;
                }

                if (this.debugMode) console.log('SaveSession :: getGraphicsForCurrentMap :: settings added for graphics = ', settings);
                return settings;
            },

            /**
             * create settings object from the given graphics Layer
             * @param   {GraphicLayer}   graphicLayer a graphics layer
             * @returns {Object} the settings to store for the graphics layer
             */
            getSettingsFromGraphicsLayer: function(graphicLayer) {
                var settings = {
                    id: graphicLayer.id,
                    graphics: []
                };

                // set the graphics from the layer
                array.forEach(graphicLayer.graphics, function(g) {
                    settings.graphics.push(g.toJson());
                }, this);

                if (this.debugMode) console.log('SaveSession :: getSettingsFromGraphicsLayer :: settings ', settings, ' added for graphicLayer = ', graphicLayer);
                return settings;
            },

            /**
             * add the graphics defined in the settings to the current map
             * @param {Object} settings = object with property for each graphic layer
             */
            setGraphicsOnCurrentMap: function(settings) {
                var propName = "",
                    settingsForLayer,
                    graphicsLayer,
                    addGraphicsToLayer;

                // helper function to add all graphics defined in the settings to the given graphics layer
                addGraphicsToLayer = function(graphicsLayer, settingsForLayer) {
                    // add to graphics layer
                    var addedGraphics = [];
                    array.forEach(settingsForLayer.graphics, function(g) {
                        var graphic = new Graphic(g);
                        addedGraphics.push(graphic);
                        graphicsLayer.add(graphic);
                    }, this);
                };

                array.forEach(settings, function(settingsForLayer, i) {
                    if (settingsForLayer.id === "map_graphics") {
                        // already exists by default so add graphics
                        addGraphicsToLayer(this.map.graphics, settingsForLayer);
                    } else {
                        graphicsLayer = this.map.getLayer(settingsForLayer.id);
                        // add a new layer
                        if (!graphicsLayer) {
                            graphicsLayer = new GraphicsLayer({
                                id: settingsForLayer.id
                            });

                            // add the graphics layer at the index - The bottom most layer has an index of 0.
                            //var idx = i - 1; // adjust to account for default map graphics at first index in settings
                            // adds the graphiclayers on top of other layers, since index not specified
                            this.map.addLayer(graphicsLayer);
                        }

                        addGraphicsToLayer(graphicsLayer, settingsForLayer);
                    }
                }, this);

                if (this.debugMode) console.log("SaveSession :: setGraphicsOnCurrentMap :: graphics added to the map");
            },

            clearAllGraphicsOnMap: function() {
                // clear the default layer
                this.map.graphics.clear();

                // remove the other graphics layers
                array.forEach(this.map.graphicsLayerIds, function(layerId) {
                    var layer = this.map.getLayer(layerId);
                    this.map.removeLayer(layer);
                }, this);
                if (this.debugMode) console.log("SaveSession :: clearAllGraphicsOnMap :: graphics removed from the map");
            },

            /**
             * save the current sessions to local storage
             */
            storeSessions: function() {
                var stringToStore = JSON.stringify(this.sessions);
                localStorage.setItem(this.storageKey, stringToStore);
                if (this.debugMode) console.log("SaveSession :: storeSessions :: completed");
            },

            /**
             * read the saved sessions from storage
             */
            loadSavedSessionsFromStorage: function() {
                var storedString = "",
                    storedSessions = null;

                storedString = localStorage.getItem("sessions");
                if (!storedString) {
                    if (this.debugMode) console.log("SaveSession :: loadSavedSessionsFromStorage : no stored sessions to load");
                    return;
                }

                storedSessions = JSON.parse(storedString);
                if (this.debugMode) console.log("SaveSession :: loadSavedSessionsFromStorage : sessions found ", storedSessions);

                // replace to current sessions
                this.sessions = storedSessions;
                if (this.debugMode) console.log("SaveSession :: loadSavedSessionsFromStorage : end");
            },

            getLayerObjectsFromMap: function() {
                return LayerInfos.getInstance(this.map, this.map.itemInfo).then(function(layerInfosObject) {
                    var layerInfos = [],
                        defs = [];
                    /*
                    layerInfosObject.traversal(function (layerInfo) {
                        layerInfos.push(layerInfo);
                    });
                    */
                    layerInfos = layerInfosObject.getLayerInfoArray();

                    defs = array.map(layerInfos, function(layerInfo) {
                        return layerInfo.getLayerObject();
                    });
                    return all(defs).then(function(layerObjects) {
                        var resultArray = [];
                        array.forEach(layerObjects, function(layerObject, i) {
                            layerObject.id = layerObject.id || layerInfos[i].id;
                            resultArray.push(layerObject);
                        });
                        return {
                            layerInfosObject: layerInfosObject,
                            layerInfos: layerInfos,
                            layerObjects: resultArray
                        };
                    });
                });
            },

            /**
             * returns the last part of the declaredClass for the given layer object
             * @param   {esri.layers.Layer} layer the map layer object
             * @returns {String} the layer type
             */
            getLayerType: function(layer) {

                var layerTypeArray = [],
                    layerType = "";

                if (!layer) {
                    return "";
                }

                layerTypeArray = layer.declaredClass.split(".");
                layerType = layerTypeArray[layerTypeArray.length - 1];
                return layerType;
            },

            enableRestoredSessions: function() {
                this.restoreMapSessionAtStartup = true;
                this.siteSettingsObj.restoreMapSessionAtStartup = this.restoreMapSessionAtStartup;

                this.currentSession = this.getSettingsForCurrentMap();

                this.siteSettingsObj.activeMapSession = this.currentSession;
                // save for next visit
                this._saveUserSettings();

                this.mapChangedHandlers.push(
                    this.map.on("extent-change", lang.hitch(this, function(evt) {
                        this.currentSession.extent = this.map.extent;
                        this.siteSettingsObj.activeMapSession = this.currentSession;
                        // save for next visit
                        this._saveUserSettings();
                    }))
                );

                this.mapChangedHandlers.push(
                    this.map.on("before-unload", lang.hitch(this, function(evt) {
                        this.currentSession = this.getSettingsForCurrentMap();
                        this.siteSettingsObj.activeMapSession = this.currentSession;
                        // save for next visit
                        this._saveUserSettings();
                    }))
                );
            },

            disableRestoredSessions: function() {
                // remove the map changed handleres...
                array.forEach(this.mapChangedHandlers, lang.hitch(this, function(handler) {
                    handler.remove();
                }));

                this.restoreMapSessionAtStartup = false;
                this.siteSettingsObj.restoreMapSessionAtStartup = this.restoreMapSessionAtStartup;

                this.currentSession = null;

                this.siteSettingsObj.activeMapSession = this.currentSession;
                // save for next visit
                this._saveUserSettings();
            },

            addHelpTips: function() {
                if (this.helpRestoreSessionText !== null) { //helpRestoreSessionNode
                    this.helpRestoreSessionTooltip = new TooltipDialog({
                        id: this.baseClass + '_helpRestoreSessionTooltip',
                        style: 'width: 240px;',
                        content: this.helpRestoreSessionText,
                        onBlur: lang.hitch(this, function() {
                            popup.close(this.helpRestoreSessionTooltip);
                        })
                    });
                    on(this.helpRestoreSessionNode, 'click', lang.hitch(this, function() {
                        popup.open({
                            popup: this.helpRestoreSessionTooltip,
                            around: this.helpRestoreSessionNode
                        });
                        this.helpRestoreSessionTooltip.focus();
                    }));
                } else {
                    domConstruct.destroy(this.helpRestoreSessionNode);
                }

                if (this.helpNewSessionText !== null) {
                    this.helpNewSessionTooltip = new TooltipDialog({
                        id: this.baseClass + '_helpNewSessionTooltip',
                        style: 'width: 240px;',
                        content: this.helpNewSessionText,
                        onBlur: lang.hitch(this, function() {
                            popup.close(this.helpNewSessionTooltip);
                        })
                    });
                    on(this.helpNewSessionNode, 'click', lang.hitch(this, function() {
                        popup.open({
                            popup: this.helpNewSessionTooltip,
                            around: this.helpNewSessionNode
                        });
                        this.helpNewSessionTooltip.focus();
                    }));
                } else {
                    domConstruct.destroy(this.helpNewSessionNode);
                }
            },

            _saveUserSettings: function() {
                if (typeof(Storage) != 'undefined') {
                    //save site...
                    // specify site...
                    this.globalSettingsObj.restoreSite = this._validNameForId(this.configName);
                    window.localStorage.setItem(this.siteStorageItemName, JSON.stringify(this.globalSettingsObj));
                    //save session...
                    window.localStorage.setItem(this.sessionStorageItemName + '_' + this.configName, JSON.stringify(this.siteSettingsObj));
                }
            },

            _validNameForId: function(str) {
                return decodeURIComponent(str).replace(/[^a-zA-Z0-9-_\\]/gi, '');
            },

            _showInfo: function(msg, level) {
                topic.publish('growler/growl', {
                    title: 'Notice:',
                    message: msg,
                    level: level,
                    timeout: 5000,
                    opacity: 1.0
                });
            },

        });
    });
