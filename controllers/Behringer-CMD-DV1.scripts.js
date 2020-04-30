function cmddv1 () {}
// Behringer CMD DV-1 Midi interface script for Mixxx Software
// Author : Tiger <tiger@braineed.org> / Tiger #Mixxx@irc.freenode.net

cmddv1.scriptVersion = "0.1.6";
cmddv1.softVRequired  = "2.2.3";

// Default channel of this device
// We substitute 1 because count starts from 0 (See MIDI specs)
cmddv1.defch = 7-1;

cmddv1.LEDCmd = 0x90; // Command Byte : Note On
cmddv1.LEDOff = 0x01; // LEDs can't be turned off, the Off status is LEDs to Orange/Amber color
cmddv1.LEDBlue = 0x00;
cmddv1.LEDBlueBlink = 0x02;

cmddv1.encLeft = 0x3F;
cmddv1.encRight = 0x41;

cmddv1.encLEDCmd = 0xB0; // Command Byte : Continuous Controller (CC)
cmddv1.encLEDMid = 0x08;
cmddv1.encLEDOff = 0x00;
cmddv1.encLEDCnt = 16; // Ring of 15 LEDs -> 16 for round maths, special handling for max
cmddv1.encLEDUnit = 1/cmddv1.encLEDCnt;

// Number of effects
cmddv1.FXChainCnt = 19; // Hardcoded but it exists a member ( [EffectRack1].num_effectunits )

// Controls container for the effect chain selected
// Encoders used for effect selection ( 2 physical * 4 virtual )
cmddv1.FXChainSel = {};
cmddv1.FXChainCtrlStart = 0x14;
cmddv1.FXChainCtrlCnt = 8;

// Stores the physicals controls addresses with their affected effect parameters string
// Example : 'RawX[EffectRack1_EffectUnitX_Effect1].parameterX': 0x15
cmddv1.FXControls = {};
cmddv1.FXChainRawCnt = 2; // 2 Physical raw of effects
cmddv1.FXChainRawPrefix = "Raw"; // Raw prefix string to insert into group string

// Stores the physicals controls addresses with their affected special effects and parameters string
cmddv1.SFXControls = {
    "0x40":"[Channel1].pitch_adjust",
    "0x41":"[QuickEffectRack1_[Channel1]].super1",
    "0x42":"[QuickEffectRack1_[Channel2]].super1",
    "0x43":"[Channel2].pitch_adjust"
};

// Decks count
cmddv1.deckCnt = 4;

// Physicals mode control start and end addresses
cmddv1.modeStartCtrl = 0x40;
cmddv1.modeEndCtrl = 0x4C;

// Physicals different modes start addresses used for comparison 
cmddv1.FocusStartCtrl = 0x40;
cmddv1.MasterStartCtrl = 0x44;
cmddv1.DoubleStartCtrl = 0x48;

// Stores the status of the modes
cmddv1.modeStatus = {
    "Focus": false,
    "Master": false,
    "Double": false
};

// As there's no control to know the current mode selection, we need to store this last one
cmddv1.lastMode = "none";

// Stores the status of the erase button
cmddv1.eraseStatus = false;
cmddv1.eraseCtrl = 0x55;

// Stores the status of the decks
cmddv1.deckStatus = {};

// First and last physical addresses of the BeatRollLoop controls
cmddv1.BeatRollLoopStartCtrl = 0x50;
cmddv1.BeatRollLoopStopCtrl = 0x53;

// Stores the physicals controls addresses of BeatRollLoop and their affected values
cmddv1.BeatRollLoopDownCtrls = {};
cmddv1.BeatRollLoopUpCtrls = {};

// Physical controls related to cues buttons
cmddv1.CUESCnt = 8;
cmddv1.CUESStartCtrl = 0x5C;
cmddv1.CUESRowShift = 4;

// Stores the physicals controls addresses to their related hotcue number
cmddv1.CUESControls = {};

// Stores the physicals controls to their corresponding Modes and Decks
// For futur use with a connected control
cmddv1.deckCtrlsByModes = {};


/*
 * Initialize the object that will be used to store effect selection
 */
cmddv1.initFXChains = function() {
    var startctrl = cmddv1.FXChainCtrlStart;
    
    for(var i=0; i < cmddv1.FXChainCtrlCnt; i++) {
        cmddv1.FXChainSel[startctrl] = false;
        midi.sendShortMsg(cmddv1.defch | cmddv1.LEDCmd, startctrl, cmddv1.LEDBlueBlink);
        startctrl += 4; // 4 encoders per effect
    }
};

/*
 * Affect each pysical control to its corresponding Mode and Deck
 * For futur use with connected control
 */
cmddv1.initDeckModesCtrls = function(onlyMode) {
    var startctrl = cmddv1.modeStartCtrl;
    
    for(var mode in (onlyMode !== undefined ? onlyMode : cmddv1.modeStatus) ) {
        cmddv1.deckCtrlsByModes[mode] = {};
        
        for(var i=1; i <= cmddv1.deckCnt; i++) {
            cmddv1.deckCtrlsByModes[mode][i]= startctrl;
            startctrl++;
        }
    }
};

/*
 * Initialize decks LEDs
 */
cmddv1.initDecksLEDs = function() {
    for(var i=cmddv1.FocusStartCtrl; i <= (cmddv1.DoubleStartCtrl+4); i++) {
        midi.sendShortMsg(cmddv1.defch | cmddv1.LEDCmd, i, cmddv1.LEDOff);
    }
};

/*
 * Initialize decks status
 */
cmddv1.initDecksStatus = function() {
    for(var i=1; i <= cmddv1.deckCnt; i++) {
        cmddv1.deckStatus[i] = false;
    }
    cmddv1.initDecksLEDs();
};

/*
 * Affect Beat ratios to the physical controls addresses
 */
cmddv1.initBeatRollLoopControls = function() {
    var ratio = 1;
    
    for(var i=cmddv1.BeatRollLoopStartCtrl; i <= cmddv1.BeatRollLoopStopCtrl; i++) {
        cmddv1.BeatRollLoopUpCtrls[i] = ratio;
        // Starting from 1 beat, we cannot have same max mirror positive beat
        // for the same number of buttons so the 2 is skipped.
        ratio *= (ratio == 1 ? 4 : 2);
    }
    
    ratio = 1/2;
    
    for(var i=cmddv1.BeatRollLoopStopCtrl; i >= cmddv1.BeatRollLoopStartCtrl; i--) {
        cmddv1.BeatRollLoopDownCtrls[i] = ratio;
        ratio /= 2;
    }
};

/*
 * Affect the hotcues to their respective physical control addresses
 */
cmddv1.initCUEControls = function() {
    var cuectrl = cmddv1.CUESStartCtrl; // 1 to 4
    var switchmid = 0x58; // 5 to 8
    
    for(var i=1; i <= cmddv1.CUESCnt; i++) {
        if(i == (cmddv1.CUESCnt/2 + 1) ) {
            cuectrl = switchmid;
        }
        cmddv1.CUESControls[cuectrl] = i;
        cuectrl++;
    }
};

/*
 * Refresh cues LEDs status (hotcue set / not set)
 */
cmddv1.refreshCuesLEDs = function(channel, offleds) {
    var sctrl = cmddv1.CUESStartCtrl;
    var cctrl = sctrl;
    
    var cuepref = "hotcue_";
    var cuesuf  = "_enabled";
    
    var LEDCol = cmddv1.LEDOff;
    
    for(var i=1; i <= cmddv1.CUESCnt; i++) {
        /*
         * Special handling of this curious hardware
         * adressing map of this controller :
         * [ 5 ] (a1) [ 6 ] (a2) [ 7 ] (a3) [ 8 ] (a4)
         * [ 1 ] (a5) [ 2 ] (a6) [ 3 ] (a7) [ 4 ] (a8)
        */
        if(cctrl == (sctrl+cmddv1.CUESRowShift)) {
            cctrl -= (cmddv1.CUESRowShift * 2);
            sctrl = cctrl;
        }
        
        if(offleds == false) {
            if(engine.getValue(channel, cuepref+i+cuesuf) == true) {
                LEDCol = cmddv1.LEDBlue;
            } else {
                LEDCol = cmddv1.LEDOff;
            }
        }
        
        midi.sendShortMsg(cmddv1.defch | cmddv1.LEDCmd, cctrl, LEDCol);
        cctrl++;
    }
}


/*
 * Reset/Clear all or only one mode status if 'onlyMode' is provided
 */
cmddv1.clearModes = function(onlyMode) {
    for(var mode in (onlyMode !== undefined ? onlyMode : cmddv1.modeStatus) ) {
        cmddv1.modeStatus[mode] = false;
    }
};

/*
 * Return the active Mode as a string
 */
cmddv1.getEnabledMode = function() {
    for(var mode in cmddv1.modeStatus) {
        if(cmddv1.modeStatus[mode] == true) {
            return mode;
        }
    }
};

/*
 * Set the new active Mode
 */
cmddv1.switchMode = function(control) {
    var checkMode = "none";
    
    if(control < cmddv1.MasterStartCtrl) {
        checkMode = "Focus";
    } else if(control < cmddv1.DoubleStartCtrl) {
        checkMode = "Master";
    } else {
        checkMode = "Double";
    }
    
    if(cmddv1.lastMode != checkMode) {
        cmddv1.lastMode = checkMode;
        cmddv1.clearModes();
        cmddv1.initDecksStatus();
        cmddv1.modeStatus[checkMode] = true;
    }
};

/*
 * Toggles the erase mode
 */
cmddv1.toggleEraser = function() {
    cmddv1.eraseStatus ^= true;
    midi.sendShortMsg(cmddv1.defch | cmddv1.LEDCmd,
                      cmddv1.eraseCtrl,
                      (cmddv1.eraseStatus == true ? cmddv1.LEDBlueBlink : cmddv1.LEDOff)
         );
};

/*
 * Set the active deck for the active mode
 */
cmddv1.enableDeck = function(channel, control, value, status, group) {
    var deck = group.substring( (group.length - 2), (group.length - 1));
    
    cmddv1.switchMode(control);
    cmddv1.refreshCuesLEDs(group, cmddv1.deckStatus[deck]);
    cmddv1.deckStatus[deck] ^= true;
    
    midi.sendShortMsg(cmddv1.defch | cmddv1.LEDCmd,
                      control,
                      (cmddv1.deckStatus[deck] == true ? cmddv1.LEDBlueBlink : cmddv1.LEDOff)
         );
};

/*
 * Beat Loop Rolls handle
 */
cmddv1.setBeatModes = function(channel, control, value, status, group) {
    if(cmddv1.getEnabledMode() !== undefined) {
        var changrp="[Channel";
        var ctrlpref = "beatlooproll_";
        var ctrlsuf = "_activate";
        
        for(var i=1; i <= cmddv1.deckCnt; i++) {
            if(cmddv1.deckStatus[i] == true) {
                if(cmddv1.modeStatus["Master"] == true) {
                    engine.setValue(changrp+i+"]", ctrlpref+cmddv1.BeatRollLoopDownCtrls[control]+ctrlsuf, value);
                }
                if(cmddv1.modeStatus["Double"] == true) {
                    engine.setValue(changrp+i+"]", ctrlpref+cmddv1.BeatRollLoopUpCtrls[control]+ctrlsuf, value);
                }
            }
        }
    }
};

/*
 * Clear/Set/Goto/GotoAndPlay the cues on selected decks
 */
cmddv1.setCues = function(channel, control, value, status, group) {
    if(cmddv1.getEnabledMode() !== undefined) {
        var changrp="[Channel";
        var cuepref = "hotcue_";
        var cuesuf = [ 'clear','set','goto','gotoandplay' ];
        
        for(var i=1; i <= cmddv1.deckCnt; i++) {
            if(cmddv1.deckStatus[i] == true) {
                var cuesufsel = undefined;
                
                if(cmddv1.eraseStatus == true) {
                    cuesufsel = 0;
                    midi.sendShortMsg(cmddv1.defch | cmddv1.LEDCmd, control, cmddv1.LEDOff);
                } else {
                    if(cmddv1.modeStatus["Focus"] == true) {
                        cuesufsel = 1;
                        midi.sendShortMsg(cmddv1.defch | cmddv1.LEDCmd, control, cmddv1.LEDBlue);
                    }
                    if(cmddv1.modeStatus["Master"] == true) {
                        cuesufsel = 2;
                    }
                    if(cmddv1.modeStatus["Double"] == true) {
                        cuesufsel = 3;
                    }
                }
                
                if(cuesufsel !== undefined ) {
                    engine.setValue(changrp+i+"]", cuepref+cmddv1.CUESControls[control]+"_"+cuesuf[cuesufsel], value);
                }
            }
        }
    }
};

/*
 * Select and assign effect to LEDs
 * Connected to a control
 */
cmddv1.encoderFXSelLitLED = function(value, group, control) {
    // Turn LED on for the selected effect
    for(var i=1; i <= cmddv1.FXChainRawCnt; i++)
    {
        var selCtrl = cmddv1.FXControls[cmddv1.FXChainRawPrefix+i+group+"."+control];
        midi.sendShortMsg(cmddv1.defch | cmddv1.encLEDCmd, selCtrl, cmddv1.FXChainSel[selCtrl]);
    }
};

/*
 * Encoders handle for effect selectors
 */
cmddv1.encoderFXSelect = function(channel, control, value, status, group) { 
    // Select previous effect
    if(value == cmddv1.encLeft) {
        engine.setValue(group, "prev_chain", 0x3F);
        if(cmddv1.FXChainSel[control] <= 1) {
            cmddv1.FXChainSel[control] = cmddv1.FXChainCnt;
        } else {
            cmddv1.FXChainSel[control]--;
        }
    }
    
    // Select next effect
    if(value == cmddv1.encRight) {
        engine.setValue(group, "next_chain", 0x41);
        if(cmddv1.FXChainSel[control] == cmddv1.FXChainCnt) {
            cmddv1.FXChainSel[control] = 1;
        } else {
            cmddv1.FXChainSel[control]++;
        }
    }
    
    // We have to update the two raw as they control the same things
    var nextRawCtrl = cmddv1.FXChainCtrlStart + (cmddv1.FXChainCtrlCnt * cmddv1.FXChainRawCnt);
    // Refresh selection value for the other effect physical raw
    cmddv1.FXChainSel[(control < nextRawCtrl ? control+16 : control-16)] = cmddv1.FXChainSel[control];
};

/*
 * Encoders handle for effect parameters
 */
cmddv1.encoderFXParam = function(channel, control, value, status, group) {
    // Get the parameter and its number
    var param = group.split(".");
    
    // Grab the current parameter value
    var fxreal = engine.getParameter(param[0], param[1]);
    
    // Increment the effect parameter value
    if(value == cmddv1.encRight) {
        fxreal += (fxreal == 1 ? 0 : cmddv1.encLEDUnit);
        engine.setParameter(param[0], param[1], fxreal);
    }
    
    // Decrement the effect parameter value
    if(value == cmddv1.encLeft) {
        fxreal -= (fxreal == 0 ? 0 : cmddv1.encLEDUnit);
        engine.setParameter(param[0], param[1], fxreal);
    }
};

/*
 * Convert an effect parameter value to the LED ring encoder scale
 */
cmddv1.encoderParamLEDValue = function(group, param) {
    var val = script.absoluteLinInverse(engine.getParameter(group, param), 0, 1, 1, cmddv1.encLEDCnt);
    if( val == cmddv1.encLEDCnt ) {
        val--; // Truncate the max value
    }
    return val;
};

/*
 * Turn on any encoder LED for a given value
 * Connected to a control
 */
cmddv1.encoderFXLitLED = function(value, group, control) {
    // Bright the corresponding LED(s)
    for(var i=1; i <= cmddv1.FXChainRawCnt; i++) {
        midi.sendShortMsg(cmddv1.defch | cmddv1.encLEDCmd,
                          cmddv1.FXControls[cmddv1.FXChainRawPrefix+i+group+"."+control],
                          cmddv1.encoderParamLEDValue(group, control)
                         );
    }
};

/*
 * Initialize FX related variables and connect the effects parameters and selection
 * to their respectives controls
 */
cmddv1.connectFXEncoders = function() {
    var fxraw = 1; // We start from raw 1 ...
    var fxunit = 1; // ... and from effect unit 1
    
    // This stay here in case of software modifications, will be easier to do changes
    var grpref = "[EffectRack1_EffectUnit";
    var grchains = [ "prev_chain", "next_chain" ];
    var grpsuf = "_Effect1]";
    var grpara = "parameter";
    
    for(var fxctrl in cmddv1.FXChainSel) {
        if( fxunit > 4 ) {
            fxraw++; // Next control raw of effects
            fxunit = 1; // Reset effect unit counter
        }
        
        // Connect chains selectors
        for(var i=0; i < 2; i++) {
            // Add an entry and affect a physical control address to the effect chain selectors strings
            cmddv1.FXControls[cmddv1.FXChainRawPrefix+fxraw+grpref+fxunit+"]."+grchains[i]] = fxctrl;
            engine.makeConnection(grpref+fxunit+"]", grchains[i], cmddv1.encoderFXSelLitLED);
        }
        
        // Connect effect parameters
        for(var i=1; i <= 3; i++) {
            fxctrl++; // First parameter starts on next control per row
            
            var fxgrp = grpref+fxunit+grpsuf;
            var fxpar = grpara+i;
            
            // Add an entry and affect a physical control address to the parameter string
            cmddv1.FXControls[cmddv1.FXChainRawPrefix+fxraw+fxgrp+"."+fxpar] = fxctrl;     

            if(fxraw == 1) {
                var conn = engine.makeConnection(fxgrp, fxpar, cmddv1.encoderFXLitLED);
                // FIXME: If we don't trigger it, this will generate an error with the parameter1
                // of the first selected effect (Not called dunno why..?)
                //conn.trigger();
                // Looks to be fixed in Mixxx 2.2.3
            }
        }
        
        fxunit++; // Next effect unit
    }
};


/*
 * Initialize Special FX related variables and connectControl the effects parameters
 */
cmddv1.connectSFXEncoders = function() {
    for(var sfxctrl in cmddv1.SFXControls) {
        var sfxgrparam = cmddv1.SFXControls[sfxctrl].split(".");
        // Add an entry and affect a physical control address to the parameter string
        // A virtual line is added with same control for compatibility with encoderFXLitLED()
        for(var i=1; i <= cmddv1.FXChainRawCnt; i++) {
            cmddv1.FXControls[cmddv1.FXChainRawPrefix+i+cmddv1.SFXControls[sfxctrl]] = sfxctrl;
        }
        var conn = engine.makeConnection(sfxgrparam[0], sfxgrparam[1], cmddv1.encoderFXLitLED);
        // Init LEDs of SFX Encoders
        conn.trigger(sfxgrparam[0], sfxgrparam[1]);
    }
};

/*
 * Turn to the defined off color all LEDs and turn off all encoders rings of LEDs
 */
cmddv1.initLEDs = function() {
    // Buttons LEDs
    for(var i=0x14; i <= 0x5F; i++)
        midi.sendShortMsg(cmddv1.defch | cmddv1.LEDCmd, i, cmddv1.LEDOff);
    
    // Encoders LEDs
    for(var i=0x14; i <= 0x43; i++)
        midi.sendShortMsg(cmddv1.defch | cmddv1.encLEDCmd, i, cmddv1.encLEDOff);
};

/*** Constructor ***/
cmddv1.init = function() {
    cmddv1.initLEDs();
    cmddv1.initFXChains();
    cmddv1.connectFXEncoders();
    cmddv1.connectSFXEncoders();
    //cmddv1.initDeckModesCtrls(); // Not fully implemented yet
    cmddv1.initBeatRollLoopControls();
    cmddv1.initCUEControls();
    print("Script '" + this.name + 
          "' loaded successfully, version " + cmddv1.scriptVersion +  
          " , requires Mixxx version " + cmddv1.softVRequired);
};

/*** Destructor ***/
cmddv1.shutdown = function() {
    cmddv1.initLEDs();
};
