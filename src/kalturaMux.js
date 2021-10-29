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

  // Events should start emitting after the initial `ready`. But there are some scenarios when
  // the `ready` will never run and will go straight to `play`. So we need this flag to determine
  // when to start emitting by looking at the `play` or `ready`, whatever happens first.
  let ignoreEvents = true;

  let playerReadySent = false;

  player.mux.emit = function (eventType, data) {
    mux.emit(playerID, eventType, data);
    // console.log('EMIT:', playerID, eventType, data);

    // adaptive media players (like dash or hls) events are set here and not inside the
    // "ready()" function becuase there are events that occur before such "videochange",
    // so if set these inside "ready()" we could lose some events.
    if (!adaptiveEventsSet) {
      adaptiveEventsSet = setAdaptiveMediaPlayerEvents(player, options);
    }
  };

  const emitReady = () => {
    if (!playerReadySent) {
      ignoreEvents = false;
      player.mux.emit('playerready');
      playerReadySent = true;
    }
  };

  player.ready().then(() => {
    emitReady();
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
    // NOTE: getVideoElementProps and getPlayerProps provide "safeCall" util with a function to get
    // the props instead just accessing the prop. This is needed so "safeCall" util can run properly
    // because it needs a function as parameter.
    // For example: the sourceurl comes in player.selectedSource.url but selectedSource can not be
    // passed to safeCall since it is not a function. If it was player.selectedSource().url then it would work.

    let getVideoElementProps = (propName) => {
      const videoElement = player.getVideoElement();
      let props = {
        width: getComputedStyle(videoElement, 'width'),
        height: getComputedStyle(videoElement, 'height')
      };

      if (videoElement.videoHeight) {
        props.videoHeight = videoElement.videoHeight;
        props.videoWidth = videoElement.videoWidth;
      }

      return props[propName];
    };

    let getPlayerProps = (propName) => {
      let props = {};

      if (player.selectedSource) {
        props.sourceUrl = player.selectedSource.url;
        props.mimetype = player.selectedSource.mimetype;
      };

      if (player.duration) {
        props.duration = secondsToMs(player.duration);
      }

      if (player.poster) {
        props.poster = player.poster;
      }

      return props[propName];
    };

    const dynamicProps = { getVideoElementProps, getPlayerProps };
    const data = {
      // Required properties
      player_is_paused: player.paused || player.ended,
      player_width: safeCall(dynamicProps, 'getVideoElementProps', ['width']),
      player_height: safeCall(dynamicProps, 'getVideoElementProps', ['height']),
      video_source_height: safeCall(dynamicProps, 'getVideoElementProps', ['videoHeight']),
      video_source_width: safeCall(dynamicProps, 'getVideoElementProps', ['videoWidth']),
      // Preferred properties
      player_is_fullscreen: safeCall(player, 'isFullscreen'),
      player_autoplay_on: player.config.playback.autoplay === true,
      player_preload_on: player.config.playback.preload === 'auto',
      video_source_url: safeCall(dynamicProps, 'getPlayerProps', ['sourceUrl']),
      video_source_mime_type: safeCall(dynamicProps, 'getPlayerProps', ['mimetype']),
      video_source_duration: safeCall(dynamicProps, 'getPlayerProps', ['duration']),
      // Optional properties
      video_poster_url: safeCall(dynamicProps, 'getPlayerProps', ['poster'])
    };

    return data;
  };

  PlaybackEventMap.forEach((kalturaEvent, muxEvent) => {
    player.addEventListener(kalturaEvent, (event) => {
      let data = {};

      if (!playerReadySent && kalturaEvent === player.Event.Core.PLAY) {
        emitReady();
      }

      // Ignore events if there is no `ready` or `play` event before
      if (ignoreEvents) {
        return;
      }

      // "adaptiveEventsSet" needs to be reset because on video changes, the _localPlayer._engine gets
      // modified and won't preserve previous players. So imagine a playlist with a progressive video, then
      // an hls, then a dash video. On every video change we need to set the adaptive media player events again
      if (kalturaEvent === player.Event.Core.CHANGE_SOURCE_STARTED) {
        adaptiveEventsSet = false;
        resetAdaptiveMediaPlayers(player);
      }

      if (kalturaEvent === player.Event.Core.ERROR) {
        // avoid duplicated errors with DASH error listener.
        if (!event.payload.data.message) { return; }
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

const setAdaptiveMediaPlayerEvents = (player, options) => {
  let eventsSet = false;

  if (player._localPlayer._engine) {
    // Regardless if enters any of the if statements below, "eventsSet" needs to be set to true.
    // This is because if entered here means that the _localPlayer._engine was set already. Then if
    // there is no an "adaptive media Player" in "_engine" like hls or shaka, we don't want to be hitting
    // this function for every single event.
    eventsSet = true;

    // Shaka Player (dash):
    const shaka = player._localPlayer._engine._mediaSourceAdapter._shaka;

    if (shaka) {
      const shakaLib = player._localPlayer._engine._mediaSourceAdapter._shakaLib;

      initializeDashHandler(player, shaka, shakaLib);
    }

    // Hls Player
    const hls = player._localPlayer._engine._mediaSourceAdapter._hls;

    if (hls) {
      const hlsLib = player._localPlayer._engine._mediaSourceAdapter._hlsjsLib;
      const playerId = player.config.targetId;

      // This prop will help to remove hls from mux if video changes
      player.mux.hlsEventsSet = true;
      mux.addHLSJS(playerId, { hlsjs: hls, Hls: hlsLib });
    }
  }

  return eventsSet;
};

const resetAdaptiveMediaPlayers = (player) => {
  // Remove HLS from mux if there is any previous monitor set
  if (player.mux.hlsEventsSet) {
    const playerId = player.config.targetId;

    player.mux.hlsEventsSet = undefined;
    mux.removeHLSJS(playerId);
  }

  // NOTE: there is no need to reset/remove shaka because kaltura resets the player on
  // video change, and since shaka events are handled manually then no need
  // to remove from mux
};

const destroy = (player) => {
  player.mux.emit('destroy');
};

export { destroy, initKalturaMux };
