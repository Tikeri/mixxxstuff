function HerculesAir () {}
// Hercules DJ Control Air Midi interface script for Mixxx Software
// Original Author : rojaro
// Author  : Tiger <tiger@braineed.org> / Tiger #Mixxx@irc.freenode.net

HerculesAir.scriptVersion = "0.1.2";
HerculesAir.softVRequired  = "2.2.3";

// Default channel of this device
HerculesAir.defch = 0;

HerculesAir.LEDCmd = 0x90;
HerculesAir.LEDOn = 0x7F;
HerculesAir.LEDOff = 0x00;

// Beat LEDs
HerculesAir.beatStepLEDCtrls = {
    "1":0x44,
    "2":0x4C,
    "3":0x44,
    "4":0x4C
};

// Current mode enabled, used for up/down buttons
HerculesAir.modes = {
    "Loops": false,
    "Effects": true,
    "Samples": false
};

// Stores the current beat steps
HerculesAir.beatSteps = [ 0, 0, 0, 0, 0 ];
// Number of beat LEDs
HerculesAir.beatStepsCnt = 3; // We count the 0 like in binary =)

// Deck count (MAX)
HerculesAir.deckCnt = 4;

// Scratch settings
HerculesAir.scratchEnable_alpha = 1.0/8;
HerculesAir.scratchEnable_beta = (1.0/8)/32;
HerculesAir.scratchEnable_intervalsPerRev = 128;
HerculesAir.scratchEnable_rpm = 33+1/3;

HerculesAir.Magic = false;
HerculesAir.switchDecks = false;

HerculesAir.wheel_multiplier = 0.4;

/*
 * Initialize controller LEDs
 */
HerculesAir.initLEDs = function() {
    // In theory this should works and turn off all LEDs...
    midi.sendShortMsg(0xB0, 0x7F, HerculesAir.LEDOff);
    
    // ... and this should turn off LEDs off individually.
    for(var i = 0x01; i < 0x4F; i++) {
        midi.sendShortMsg(0x90, i, HerculesAir.LEDOff);
    }
    
    // Update all LEDs ?
    midi.sendShortMsg(0xB0, 0x7F, HerculesAir.LEDOn);
};

/*
 * Initialize beat progress LEDs and connect them
 * @decks :
 * 2 -> Deck1 & Deck2
 * 4 -> Deck3 & Deck4
 */
HerculesAir.initBeatProgress = function(decks) {
    for( var i = 1; i <= HerculesAir.deckCnt; i++) {
        if( (decks == 2 && i > decks) || (decks == 4 && i <= decks/2) ) {
            var disco = true;
        } else {
            var disco = undefined;
        }
        
        engine.connectControl("[Channel"+i+"]",
                              "beat_active",
                              "HerculesAir.beatProgressDeck",
                              (disco == undefined ? undefined : disco)
                             );
        engine.connectControl("[Channel"+i+"]",
                              "play",
                              "HerculesAir.playDeck",
                              (disco == undefined ? undefined : disco)
                             );
    }
};

/*
 * Reset/Initialize the beat LEDs VU-Meters
 * connectControled
 */
HerculesAir.playDeck = function(value, group, control) {
    if(engine.getValue(group, control) == 0) {
        for(var i = 0; i <= HerculesAir.beatStepsCnt; i++) {
            HerculesAir.beatSteps[script.deckFromGroup(group)] = 0; // Reset the beat LEDs
            midi.sendShortMsg(0x90, HerculesAir.beatStepLEDCtrls[script.deckFromGroup(group)]+i, HerculesAir.LEDOff);
        }
    }
}

/*
 * Show the beat progression via LEDs VU-Meters labelled A & B
 * connectControled
 */
HerculesAir.beatProgressDeck = function(value, group, control) {
    var deck = script.deckFromGroup(group);
    
    if(engine.getValue(group, control) == 1) {
        midi.sendShortMsg(HerculesAir.LEDCmd, HerculesAir.beatStepLEDCtrls[deck]+HerculesAir.beatSteps[deck], HerculesAir.LEDOff);
        
        if(HerculesAir.beatSteps[deck] >= HerculesAir.beatStepsCnt) {
            HerculesAir.beatSteps[deck] = 0;
        } else {
            HerculesAir.beatSteps[deck]++;
        }
        
        midi.sendShortMsg(HerculesAir.LEDCmd, HerculesAir.beatStepLEDCtrls[deck]+HerculesAir.beatSteps[deck], HerculesAir.LEDOn);
    }
}

/*
 * Set the current active mode
 */
HerculesAir.Mode = function(value, group, control) {
    for(var mode in HerculesAir.modes) {
        HerculesAir.modes[mode] = false;
    }
    
    switch(control) {
        case 0x37:
            HerculesAir.modes['Loops'] = true;
            break;;
        case 0x38:
            HerculesAir.modes['Effects'] = true;
            break;;
        case 0x2F:
            HerculesAir.modes['Samples'] = true;
            break;;
        default:
            break;;
    }
};

HerculesAir.updownMode = function(value, group, control) {
    
}

/*
 * Switch between Decks A & B and Decks C & D
 */
HerculesAir.switchDecksMode = function(midino, control, value, status, group) {
    if( value == 0x7F ) {
        HerculesAir.switchDecks ^= true;
        midi.sendShortMsg(HerculesAir.LEDCmd | HerculesAir.defch,
                          control,
                          (HerculesAir.switchDecks == true ? HerculesAir.LEDOn : HerculesAir.LEDOff)
                         );
        HerculesAir.initBeatProgress( (HerculesAir.switchDecks == true ? 4 : 2) );
    }
}

/*
 * Handles the head{Volume/Gain}
 * connectControled
 */
HerculesAir.headVol = function(value, group, control) {
    var ratio = 1/10; // Built-in controller audio device, 10 steps for head output volume
    
    var grp = "[Master]";
    var para = "headGain";
    
    var val = engine.getParameter(grp, para);
    
    // Head Volumes button send 0x7F when pushed and 0x00 when released, so we do stuff above once only
    if( control == 0x7F ) {
        if( group == 0x3B) { // Button "-" => Reduce headGain
            val -= ratio;
        }
        if( group == 0x3C) { // Button "+" => Increase headGain
            val += ratio;
        }
        engine.setParameter(grp, para, (val > 1 ? 1 : val) );
    }
};

/*
 * headCue mode 
 */
HerculesAir.headCue = function(midino, control, value, status, group) {
    if(engine.getValue(group, "headMix") == 0) {
        engine.setValue(group, "headMix", -1.0);
        midi.sendShortMsg(0x90, 0x39, 0x00);
        midi.sendShortMsg(0x90, 0x3A, 0x7f);
    }
};

/*
 * headMix mode
 */
HerculesAir.headMix = function(midino, control, value, status, group) {
    if(engine.getValue(group, "headMix") != 1) {
        engine.setValue(group, "headMix", 0);
        midi.sendShortMsg(0x90, 0x39, 0x7f);
        midi.sendShortMsg(0x90, 0x3A, 0x00);
    }
};

/*
 * Special function called when "Magic" (shift) button is pressed :
 * Load the selected track into the desired sampler (Sample->Pads)
 */
HerculesAir.sampler = function(midino, control, value, status, group) {
    if(value != 0x00) {
        if(HerculesAir.Magic) {
                engine.setValue(group, "LoadSelectedTrack", 1)
        } else if(engine.getValue(group, "play") == 0) {
                engine.setValue(group, "start_play", 1)
        } else {
                engine.setValue(group, "play", 0)
        }
    }
}

/*
 * When track not playing, use Jogs to navigate trough the song (like ZIP)
 */
HerculesAir.wheelTurn = function(midino, control, value, status, group) {

    var deck = script.deckFromGroup(group);
    deck = (HerculesAir.switchDecks == true ? deck+2 : deck);
    
    newgroup = "[Channel"+deck+"]";
    
    var newValue=(value==0x01 ? 1: -1);
    // See if we're scratching. If not, do wheel jog.
    if (!engine.isScratching(deck)) {
        engine.setValue(newgroup, "jog", newValue* HerculesAir.wheel_multiplier);
        return;
    }

    if (engine.getValue(newgroup, "play") == 0) {
        var new_position = engine.getValue(newgroup,"playposition") + 0.008 * (value == 0x01 ? 1 : -1);
        if(new_position < 0) new_position = 0;
        if(new_position > 1) new_position = 1;
        engine.setValue(newgroup,"playposition", new_position);
    } else {
        // Register the movement
        engine.scratchTick(deck, newValue);
    }

}

/*
 * Function called when using wheels as Jogs
 */
HerculesAir.jog = function(midino, control, value, status, group) {
    var deck = script.deckFromGroup(group);
    deck = (HerculesAir.switchDecks == true ? deck+2 : deck);
    
    var newgroup = "[Channel"+deck+"]";
    
    var newValue = (value == 0x01 ? 1:-1);
    engine.setValue(newgroup, "jog", newValue* HerculesAir.wheel_multiplier);
}

/*
 * Scratch function used when Jogs/Wheel are enabled (pushed down)
 */
HerculesAir.scratch_enable = function(midino, control, value, status, group) {
    var deck = script.deckFromGroup(group);
    deck = (HerculesAir.switchDecks == true ? deck+2 : deck);
    
    if(value == 0x7f) {
        engine.scratchEnable(
                deck,
                HerculesAir.scratchEnable_intervalsPerRev,
                HerculesAir.scratchEnable_rpm,
                HerculesAir.scratchEnable_alpha,
                HerculesAir.scratchEnable_beta
        );
    } else {
        engine.scratchDisable(deck);
    }
}

/*
 * Magic Button used a "shift" function
 */
HerculesAir.shift = function(midino, control, value, status, group) {
    HerculesAir.Magic = (value == 0x7f);
    midi.sendShortMsg(status, control, value);
}

/*** Constructor ***/
HerculesAir.init = function(id) {
    HerculesAir.initLEDs();
    
    HerculesAir.initBeatProgress(2);
    
    // headGain always higher than 50% from the built-in soundcard
    // Here's some dmesg output :
    // usb_audio: Warning! Unlikely big volume range (=12160), cval->res is probably wrong.
    // usb_audio: [3] FU [PCM Playback Volume] ch = 4, val = -9088/3072/1
    engine.setParameter("[Master]", "headGain", 0.7);
    // Now we can connect the control that have approx real value of the volume set physically on
    // the device
    engine.connectControl("[Master]","headGain", "HerculesAir.headVol");
    
    midi.sendShortMsg(0x90, 0x3B, 0x7F) // headset volume "-" button LED (always on)
    midi.sendShortMsg(0x90, 0x3C, 0x7F) // headset volume "+" button LED (always on)
    
    if(engine.getValue("[Master]", "headMix") > 0.5) {
            midi.sendShortMsg(0x90, 0x39, 0x7F) // headset "Mix" button LED
    } else {
            midi.sendShortMsg(0x90, 0x3A, 0x7F) // headset "Cue" button LED
    }
    print("Script loaded successfully, version " + HerculesAir.scriptVersion + " , requires Mixxx version " + HerculesAir.softVRequired);
}

/*** Destructor ***/
HerculesAir.shutdown = function() {
	HerculesAir.initLEDs()
}
