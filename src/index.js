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
  PlaybackEventMap.set('error', player.Event.Core.ERROR);

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

  player.ready().then(() => {
    player.mux.emit('playerready', {});
  });

  PlaybackEventMap.forEach((kalturaEvent, muxEvent) => {
    player.addEventListener(kalturaEvent, (event) => {
      let data = {};

      if (kalturaEvent === player.Event.Core.ERROR) {
        data.player_error_code = event.payload.code;
        data.player_error_message = event.payload.data.message;
      } ;
      player.mux.emit(muxEvent, data);
    });
  });

  AdsEventMap.forEach((kalturaEvent, muxEvent) => {
    player.addEventListener(kalturaEvent, (event) => {
      let data = {};

      if (kalturaEvent === player.Event.AD_STARTED) {
        const ad_tag_url = player.ads.getAd()._url;

        player.mux.emit('ad_tag_url', ad_tag_url);
      } if (kalturaEvent === player.Event.AD_ERROR) {
        data.player_error_code = event.payload.code;
        data.player_error_message = event.payload.data.message;
      }
      player.mux.emit(muxEvent, data);
    }
    );
  });

  // The following are linking events that the Mux core SDK requires with events from the player.
  // There may be some cases where the player will send the same Mux event on multiple different
  // events at the player level (e.g. mux.emit('play') may be as a result of multiple player events)
  // OR multiple mux events will be sent as the result of a single player event (e.g. if there is
  // a single event for breaking to a midroll ad, and mux requires a `pause` and an `adbreakstart` event both)

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

  // Emit the `adplaying` event when the current ad begins progressing and displaying
  // frames. This should match the `playing` event, but specific to ads. NOTE:
  // you may need to do the same thing here as with `play` if there is no `adplaying` event
  // player.on('adplayingEvent', () => {
  //   player.mux.emit('adplaying');
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
