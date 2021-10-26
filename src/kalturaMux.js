import mux from 'mux-embed';
import initializeAdEvents from './ads.js';
import initializeDashHandler from './dash.js';
import { VERSION } from 'kaltura-player-js';

const log = mux.log;
const secondsToMs = mux.utils.secondsToMs;
const assign = mux.utils.assign;
const getComputedStyle = mux.utils.getComputedStyle;
const safeCall = mux.utils.safeCall;

const initKalturaMux = function (player, options) {
  // Make sure we got a player - Check properties to ensure that a player was passed
  if (typeof player !== 'object') {
    log.warn('[kaltura-mux] You must provide a valid Kaltura player to initKalturaMux.');
    return;
  }

  // Enable customers to emit events through the player instance
  player.mux = {};
  let adaptiveEventsSet = false;

  player.mux.emit = function (eventType, data) {
    mux.emit(playerID, eventType, data);
    // console.log('EMIT:', playerID, eventType, data);

    // adaptive media players (like dash or hls) events are set here and not inside the
    // "ready()" function becuase there are events that occur before such "videochange",
    // so if set these inside "ready()" we could lose some events.
    if (!adaptiveEventsSet) {
      adaptiveEventsSet = setAdaptiveMediaPlayerEvents(player);
    }
  };

  let playerReadySent = false;

  player.ready().then(() => {
    if (!playerReadySent) {
      player.mux.emit('playerready');
      playerReadySent = true;
    }
  });

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
    player_software_version: VERSION,
    player_mux_plugin_name: 'kaltura-mux',
    player_mux_plugin_version: '[AIV]{version}[/AIV]'
  }, options.data);

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
      video_source_height: safeCall(videoElement, 'videoHeight'),
      video_source_width: safeCall(videoElement, 'videoWidth'),
      // Preferred properties
      player_is_fullscreen: safeCall(player, 'isFullscreen'),
      player_autoplay_on: player.config.playback.autoplay === true,
      player_preload_on: player.config.playback.preload === 'auto',
      video_source_url: safeCall(player.selectedSource, 'url'),
      video_source_mime_type: safeCall(player.selectedSource, 'mimetype'),
      video_source_duration: secondsToMs(player.duration),
      // Optional properties
      video_poster_url: player.poster
    };
  };

  PlaybackEventMap.forEach((kalturaEvent, muxEvent) => {
    player.addEventListener(kalturaEvent, (event) => {
      let data = {};

      // "adaptiveEventsSet" needs to be reset because on video changes, the _localPlayer._engine gets
      // modified and won't preserve previous players. So imagine a playlist with a progressive video, then
      // an hls, then a dash video. On every video change we need to set the adaptive media player events again
      if (kalturaEvent === player.Event.Core.CHANGE_SOURCE_STARTED) {
        adaptiveEventsSet = false;
      }

      if (kalturaEvent === player.Event.Core.ERROR) {
        data.player_error_code = event.payload.code;
        data.player_error_message = event.payload.data.message;
      };
      player.mux.emit(muxEvent, data);
    });
  });

  initializeAdEvents(player);

  const playerID = player.config.targetId;

  mux.init(playerID, options);
};

const setAdaptiveMediaPlayerEvents = (player) => {
  let eventsSet = false;

  if (player._localPlayer._engine) {
    // Regardless if enters any of the if statements below, "eventsSet" needs to be set to true.
    // This is because if entered here means that the _localPlayer._engine was set already. Then if
    // there is no an "adaptive media Player" in "_engine" like hls or shaka, we don't want to be hitting
    // this function for every single event.
    eventsSet = true;

    // Shaka Player:
    const dash = player._localPlayer._engine._mediaSourceAdapter._shaka;

    if (dash) {
      initializeDashHandler(player, dash);
    }
  }

  return eventsSet;
};

export default initKalturaMux;
