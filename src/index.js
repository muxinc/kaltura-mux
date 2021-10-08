import mux from 'mux-embed';

const log = mux.log;
const secondsToMs = mux.utils.secondsToMs;
const assign = mux.utils.assign;
const getComputedStyle = mux.utils.getComputedStyle;
const safeCall = mux.utils.safeCall;

// eslint-disable-next-line no-undef
const kalturaPlayer = KalturaPlayer;

const initKalturaMux = function (player, options) {
  // Make sure we got a player - Check properties to ensure that a player was passed
  if (typeof player !== 'object') {
    log.warn('[kaltura-mux] You must provide a valid Kaltura player to initKalturaMux.');
    return;
  }

  // Accessor for event namespace if used by your player
  // const YOURPLAYER_EVENTS = || {};
  const PlaybackEventMap = new Map();
  const AdsEventMap = new Map();

  PlaybackEventMap.set('play', player.Event.Core.PLAY);
  PlaybackEventMap.set('videochange', player.Event.Core.CHANGE_SOURCE_STARTED);
  PlaybackEventMap.set('playing', player.Event.Core.PLAYING);
  PlaybackEventMap.set('pause', player.Event.Core.PAUSE);
  PlaybackEventMap.set('timeupdate', player.Event.Core.TIMEUPDATE);
  PlaybackEventMap.set('seeking', player.Event.Core.SEEKING);
  PlaybackEventMap.set('seeked', player.Event.Core.SEEKED);
  PlaybackEventMap.set('ended', player.Event.Core.ENDED);

  AdsEventMap.set('adbreakstart', player.Event.AD_BREAK_START);
  AdsEventMap.set('adplaying', player.Event.AD_STARTED);
  AdsEventMap.set('adpause', player.Event.AD_PAUSED);
  AdsEventMap.set('adfirstquartile', player.Event.AD_FIRST_QUARTILE);
  AdsEventMap.set('admidpoint', player.Event.AD_MIDPOINT);
  AdsEventMap.set('adthirdquartile', player.Event.AD_THIRD_QUARTILE);
  AdsEventMap.set('adended', player.Event.AD_COMPLETED);
  AdsEventMap.set('adbreakend', player.Event.AD_BREAK_END);
  AdsEventMap.set('aderror', player.Event.AD_ERROR);

  // Prepare the data passed in
  options = options || {};

  options.data = assign({
    player_software_name: 'Kaltura',
    player_software_version: kalturaPlayer.VERSION,
    player_mux_plugin_name: 'kaltura-mux',
    player_mux_plugin_version: '[AIV]{version}[/AIV]'
  }, options.data);

  // Retrieve the ID and the player element
  const playerID = player.config.targetId;

  // Enable customers to emit events through the player instance
  player.mux = {};
  player.mux.emit = function (eventType, data) {
   // mux.emit(playerID, eventType, data);
    console.log('EMIT:', playerID, eventType, data);
  };

  // Allow mux to retrieve the current time - used to track buffering from the mux side
  // Return current playhead time in milliseconds
  options.getPlayheadTime = () => {
    return secondsToMs(player.currentTime);
  };

      // Allow mux to automatically retrieve state information about the player on each event sent
  options.getStateData = () => {
    const videoElement = player.getVideoElement();

    return {
      // Required properties
      player_is_paused: player.paused || player.ended,
      player_width: getComputedStyle(videoElement, 'width'),
      player_height: getComputedStyle(videoElement, 'height'),
      video_source_height: videoElement.videoHeight,
      video_source_width: videoElement.videoWidth,
      // Preferred properties
      player_is_fullscreen: safeCall(player, 'isFullscreen'),
      player_autoplay_on: player.config.playback.autoplay === true,
      player_preload_on: player.config.playback.preload === 'auto',
      video_source_url: player.selectedSource.url,
      video_source_mime_type: player.selectedSource.mimetype,
      video_source_duration: secondsToMs(player.duration),
      // Optional properties
      video_poster_url: player.poster
    };
  };

  // LOOP THROUGH EVENTS_DICTIONARY AND set the events
  player.ready().then(() => {
	  console.log('player ready');
  });
  PlaybackEventMap.forEach((val, key) => {
	const eventName = val;

	player.addEventListener(eventName, (event) => {
	    console.log(event.type);
	});
  });

  AdsEventMap.forEach((val, key) => {
	const eventName = val;

	player.addEventListener(eventName, (event) => {
		if(eventName === player.Event.AD_STARTED){
			const ad_tag_url = player.ads.getAd()._url;
	  		console.log("ad-tag-url", ad_tag_url);
		}
	    console.log(event.type);
	});
  });


	  

  // The following are linking events that the Mux core SDK requires with events from the player.
  // There may be some cases where the player will send the same Mux event on multiple different
  // events at the player level (e.g. mux.emit('play') may be as a result of multiple player events)
  // OR multiple mux events will be sent as the result of a single player event (e.g. if there is
  // a single event for breaking to a midroll ad, and mux requires a `pause` and an `adbreakstart` event both)

  // Emit the `playerready` event when the player has finished initialization and is ready to begin
  // player.on('readyEvent', () => {
  //   player.mux.emit('playerready');
  // });

  // Emit the `pause` event when the player is instructed to pause playback. Examples are:
  // 1) User clicks pause to halt playback
  // 2) Playback of content is paused in order to break to an ad (may require simulating the `pause` event when the ad break starts if player is not explicitly paused)
  // player.on('pauseEvent', () => {
  //   player.mux.emit('pause');
  // });

  // Emit the `play` event when the player is instructed to start playback of the content. Examples are:
  // 1) Initial playback of the content via an autoplay mechanism
  // 2) The user clicking play on the player
  // 3) The user resuming playback of the video (by clicking play) after the player has been paused
  // 4) Content playback is resuming after having been paused for an ad to be played inline (may require additional event tracking than the one below)
  // player.on('playEvent', () => {
  //   player.mux.emit('play');
  // });

  // Emit the `playing` event when the player begins actual playback of the content after the most recent
  // `play` event. This should refer to when the first frame is displayed to the user (and when the next
  // frame is presented for resuming from a paused state)
  // player.on('playingEvent', () => {
  //   player.mux.emit('playing');
  // });

  // NOTE: some players do not have an accurate `playing` event to use. In these scenarios, we typically track
  // the first timeupdate with a playhead progression as the `playing` event, but send the event with a
  // viewer_time back in time by the progressed amount. See below:
  /*
    player.on('playEvent'', () => {
      const playTime = player.getCurrentTime();

      // Listen for the first time update to be able to send PLAYING
      let sendPlaying = (data) => {
        const now = Date.now();
        const currentTime = player.getCurrentTime();
        const timeDiff = currentTime - playTime;

        // Only send playing if we've progressed some
        if (timeDiff > 0) {
          // Unregister so it doesn't keep firing
          player.off('timeupdateEvent', sendPlaying);
          player.mux.emit('playing', {
            viewer_time: now - secondsToMs(timeDiff)
          });
        }
      };

      player.on('timeupdateEvent', sendPlaying);

      // And clear this handler if we happen to get pause, error, seeking, or ended before timeupdate
      player.on('pauseEvent', () => { player.off('timeupdateEvent', sendPlaying); });
      player.on('endedEvent', () => { player.off(timeupdateEvent, sendPlaying); });
      player.on('seekEvent', () => { player.off(timeupdateEvent, sendPlaying); });
      player.on('errorEvent', () => { player.off(timeupdateEvent, sendPlaying); });
    });
  */

  // Emit the `seeking` event when the player begins seeking to a new position in playback
  // player.on('seekingEvent', () => {
  //   player.mux.emit('seeking');
  // });

  // Emit the `seeked` event when the player completes the seeking event (the new playhead position
  // is available, and the player is beginnig to play back at the new location)
  // player.on('seekedEvent', () => {
  //   player.mux.emit('seeked');
  // });

  // Emit the `timeupdate` event when the current playhead position has progressed in playback
  // This event should happen at least every 250 milliseconds
  // player.on('timeupateEvent', () => {
  //   player.mux.emit('timeupdate', {
  //     player_playhead_time: player.currentTime() // If you have the time passed in as a param to your event, use that
  //   });
  // });

  // Emit the `error` event when the current playback has encountered a fatal
  // error. Ensure to pass the error code and error message to Mux in this
  // event. You _must_ include at least one of error code and error message
  // (but both is better)
  // player.on('errorEvent', () => {
  //   player.mux.emit('error', {
  //     player_error_code: player.errorCode(), // The code of the error
  //     player_error_message: player.errorMessage() // The message of the error
  //   });
  // });

  // Emit the `ended` event when the current asset has played to completion,
  // without error.
  // player.on('endedEvent', () => {
  //   player.mux.emit('ended');
  // });

  /* AD EVENTS */
  // Depending on your player, you may have separate ad events to track, or
  // the standard playback events may double as ad events. If the latter is the
  // case, you should track the state of the player (ad vs content) and then
  // just prepend the Mux events above with 'ad' when those events fire and
  // the player is in ad mode.

  // Emit the `adbreakstart` event when the player breaks to an ad slot. This
  // may be directly at the beginning (before a play event) for pre-rolls, or
  // (for both pre-rolls and mid/post-rolls) may be when the content is paused
  // in order to break to ad.
  // player.on('adbreakstartEvent', () => {
  //   // Some players do not emit a pause event when breaking to ad. Please manually
  //   // emit this if your player does not do this automatically.
  //   /*
  //     if (shouldEmitPause) {
  //       player.mux.emit('pause');
  //     }
  //   */
  //   player.mux.emit('adbreakstart');
  // });

  // Emit the `adbreakend` event when the ad break is over and content is about
  // to be resumed.
  // player.on('adbreakendEvent', () => {
  //   player.mux.emit('adbreakend');
  //   // Some players do not emit a play event when resuming from ad. Please manually
  //   // emit this if your player does not do this automatically.
  //   /*
  //     if (shouldEmitPlay) {
  //       player.mux.emit('play');
  //     }
  //   */
  // });

  // Emit the `adplay` event when an individual ad within an ad break is instructed
  // to play. This should match the `play` event, but specific to ads (e.g. should
  // fire on initial play as well as plays after a pause)
  // player.on('adplayEvent', () => {
  //   player.mux.emit('adplay');
  // });

  // Emit the `adplaying` event when the current ad begins progressing and displaying
  // frames. This should match the `playing` event, but specific to ads. NOTE:
  // you may need to do the same thing here as with `play` if there is no `adplaying` event
  // player.on('adplayingEvent', () => {
  //   player.mux.emit('adplaying');
  // });

  // Emit the `adpause` event when an individual ad within an ad break is instructed
  // to pause. This should match the `pause` event, but specific to ads
  // player.on('adpauseEvent', () => {
  //   player.mux.emit('adpause');
  // });

  // Emit the `adended` event when an individual ad within an ad break is played to
  // completion. This should match the `ended` event, but specific to ads
  // player.on('adendedEvent', () => {
  //   player.mux.emit('adended');
  // });

  // Emit the `aderror` event when an individual ad within an ad break encounters
  // an error. This should match the `error` event, but specific to ads
  // player.on('aderrorEvent', () => {
  //   player.mux.emit('aderror');
  // });

  // If your player has a destroy/dispose event to clean up the player, pass
  // this on to Mux as a `destroy` event.
  // player.on('destroyEvent', () => {
  //   // Turn off all listeners for your player if that's possible/needed
  //   // Then emit `destroy`
  //   player.mux.emit('destroy');
  // });

  // Lastly, initialize the tracking
  // mux.init(playerID, options);
};

export default initKalturaMux;
