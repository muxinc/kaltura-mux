import mux from 'mux-embed';
import initializeAdEvents from './ads.js';
import initializeDashHandler from './dash.js';
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

  const PlaybackEventMap = new Map();

  PlaybackEventMap.set('play', player.Event.Core.PLAY);
  PlaybackEventMap.set('videochange', player.Event.Core.CHANGE_SOURCE_STARTED);
  PlaybackEventMap.set('playing', player.Event.Core.PLAYING);
  PlaybackEventMap.set('pause', player.Event.Core.PAUSE);
  PlaybackEventMap.set('timeupdate', player.Event.Core.TIMEUPDATE);
  PlaybackEventMap.set('seeking', player.Event.Core.SEEKING);
  PlaybackEventMap.set('seeked', player.Event.Core.SEEKED);
  PlaybackEventMap.set('ended', player.Event.Core.ENDED);
  PlaybackEventMap.set('error', player.Event.Core.ERROR);

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
    mux.emit(playerID, eventType, data);
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
        // const errorCategoryMap = player._localPlayer._engine._mediaSourceAdapter._shakaLib.util.Error.Category;
        // const errorCodeMap = player._localPlayer._engine._mediaSourceAdapter._shakaLib.util.Error.Code;
        // const err_category = Object.keys(errorCategoryMap).find(key => errorCategoryMap[key] === event.payload.category);
        // const err_code = Object.keys(errorCodeMap).find(key => errorCodeMap[key] === event.payload.code);

        // console.log("error category",err_category, err_code);
        data.player_error_code = event.payload.code;
        data.player_error_message = event.payload.data.message;
      };
      player.mux.emit(muxEvent, data);
    });
  });

  initializeAdEvents(player);

  const dash = player._localPlayer._engine._mediaSourceAdapter._shaka;
  const dashLib = player._localPlayer._engine._mediaSourceAdapter._shakaLib;
  const hls = player._localPlayer._engine._mediaSourceAdapter._hls;
  const hlsLib = player._localPlayer._engine._mediaSourceAdapter._hlsjsLib;

  if (dash) {
    initializeDashHandler(player, dash, dashLib);
  }

  if (hls) {
    options.hlsjs = hls;
    options.Hls = hlsLib;
  }

  // Initialize the tracking
  mux.init(playerID, options);
};

export default initKalturaMux;
