/* global mw */
import mux from 'mux-embed';
// const log = mux.log;
const assign = mux.utils.assign;
const secondsToMs = mux.utils.secondsToMs;
const clock = mux.utils.clock;

const muxPlugin = {
  defaultConfig: {
    options: {}
  },

  setup: function () {
    const player = this.getPlayer();
    const options = this.getConfig('options') || {data: {}};

    options.data = assign({}, options.data, {
      player_software_name: 'Kaltura',
      player_software_version: player.evaluate('{playerVersion}'),
      player_mux_plugin_name: 'kaltura-mux',
      player_mux_plugin_version: '[AIV]{version}[/AIV]'
    });

    const playerId = player.id;

    player.mux = {};
    player.mux.emit = function (eventType, data) {
      mux.emit(playerId, eventType, data);
    };

    options.getPlayheadTime = function () {
      secondsToMs(player.evaluate('{video.player.currentTime}'));
    };

    options.getStateData = function () {
      const config = player.evaluate('{configProxy}') || {};
      const flashvars = config.flashvars || {};
      const source = player.getSource() || {};

      return {
        player_is_paused: !player.playing,
        player_width: player.getWidth(),
        player_height: player.getHeight(),
        player_autoplay_on: flashvars.autoPlay,
        video_source_url: source.src,
        video_source_mime_type: source.mimeType,
        video_source_duration: player.getDuration()
        /*
         * None of the below seem possible for this version of Kaltura's player
         * video_source_height: player.currentSource().height,
         * video_source_width: player.currentSource().width,
         * player_is_fullscreen: fullscreen,
         * player_preload_on: ,
         * video_poster_url: ,
         * player_language_code: ,
         */
      };
    };

    player.addJsListener('playerReady.muxData', () => player.mux.emit('playerready'));
    player.addJsListener('playerPaused.muxData', () => player.mux.emit('pause'));
    player.addJsListener('playerPlayed.muxData', () => {
      const playTimeMs = secondsToMs(player.evaluate('{video.player.currentTime}'));
      const sendPlaying = (currentTime) => {
        const now = clock.now();
        const currentTimeMs = secondsToMs(currentTime);
        const timeDiff = currentTimeMs - playTimeMs;

        // Only send playing if we've progressed some
        if (timeDiff > 0) {
          // Unregister so it doesn't keep firing
          player.removeJsListener('.muxPlayingMonitor');
          player.mux.emit('playing', {
            viewer_time: now - timeDiff
          });
        }
      };

      player.addJsListener('playerUpdatePlayhead.muxPlayingMonitor', sendPlaying);

      // And clear this handler if we happen to get pause, error, seeking, or ended before timeupdate
      player.addJsListener('playerPaused.muxPlayingMonitor', () => { player.removeJsListener('.muxPlayingMonitor'); });
      player.addJsListener('mediaError.muxPlayingMonitor', () => { player.removeJsListener('.muxPlayingMonitor'); });
      player.addJsListener('playerError.muxPlayingMonitor', () => { player.removeJsListener('.muxPlayingMonitor'); });
      player.addJsListener('preSeek.muxPlayingMonitor', () => { player.removeJsListener('.muxPlayingMonitor'); });

      // Finally send play
      player.mux.emit('play');
    });
    player.addJsListener('preSeek.muxData', () => player.mux.emit('seeking'));
    player.addJsListener('seeked.muxData', () => player.mux.emit('seeked'));
    player.addJsListener('playerUpdatePlayhead.muxData', (currentTime) => player.mux.emit('timeupdate', {player_playhead_time: secondsToMs(currentTime)}));
    player.addJsListener('mediaError.muxData', (error) => player.mux.emit('error', {player_error_code: error.code, player_error_message: error.message}));
    player.addJsListener('playerError.muxData', (error) => player.mux.emit('error', {player_error_code: error.code, player_error_message: error.message}));

    // Ad events
    player.addJsListener('preSequenceStart.muxData', () => player.mux.emit('adbreakstart'));
    player.addJsListener('midSequenceStart.muxData', () => player.mux.emit('adbreakstart'));
    player.addJsListener('postSequenceStart.muxData', () => player.mux.emit('adbreakstart'));
    player.addJsListener('preSequenceComplete.muxData', () => player.mux.emit('adbreakend'));
    player.addJsListener('midSequenceComplete.muxData', () => player.mux.emit('adbreakend'));
    player.addJsListener('postSequenceComplete.muxData', () => player.mux.emit('adbreakend'));
    player.addJsListener('onAdPlay.muxData', () => {
      player.mux.emit('adplay');
      player.mux.emit('adplaying');
    });
    player.addJsListener('onAdComplete.muxData', () => player.mux.emit('adended'));
    player.addJsListener('onAdSkip.muxData', () => {
      player.mux.emit('adskipped');
      player.mux.emit('adended');
    });
    player.addJsListener('adErrorEvent.muxData', () => player.mux.emit('aderror'));

    mux.init(playerId, options);
  },

  destroy: function () {
    const player = this.getPlayer();

    player.mux.emit('destroy');
    player.removeJsListener('.muxData');
    this.unbind();
    this._super();
  }
};

// Careful here, this is run multiple times, and can run at a point
// where this is not a function, so just be safe.
if (typeof mw.kalturaPluginWrapper === 'function') {
  mw.kalturaPluginWrapper(function () {
    mw.PluginManager.add('mux', mw.KBaseComponent.extend(muxPlugin));
  });
}
